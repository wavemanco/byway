import { c1, c2, c3, c4, c5, c6a, c7, PROTOCOL_CONFIGS } from '@byway/catalog';
import type { CostEstimate } from '@byway/contracts';
import { PROFILES } from '@byway/gateway';
import { withHash, type Node, type Recipe } from '@byway/recipe';
import { describe, expect, it } from 'vitest';
import { createAdvisor, estimateRecipe, HUMAN_MINUTES, TOKEN_ASSUMPTIONS } from '../src/index.ts';
import { demoAdvisor, demoGateway, recordingPrompts } from './helpers.ts';

/** A copy of the recipe with the node of this id changed. */
function edit(recipe: Recipe, id: string, change: (n: Node) => Node): Recipe {
  const visit = (n: Node): Node => {
    const self = 'id' in n && n.id === id ? change(n) : n;
    switch (self.op) {
      case 'seq':
        return { ...self, steps: self.steps.map(visit) };
      case 'route':
        return { ...self, branches: self.branches.map((b) => ({ ...b, body: visit(b.body) })) };
      case 'audit':
        return { ...self, lenses: self.lenses.map((l) => ({ ...l, body: visit(l.body) })) };
      case 'step':
      case 'pick':
        return self;
      default:
        return { ...self, body: visit(self.body) } as Node;
    }
  };
  return withHash({ ...recipe, stages: recipe.stages.map((s) => ({ ...s, body: visit(s.body) })) });
}
const withLoopMax = (r: Recipe, id: string, max: number) => edit(r, id, (n) => (n.op === 'loop' ? { ...n, gate: { ...n.gate, max } } : n));
const withReplicas = (r: Recipe, id: string, n: number) => edit(r, id, (x) => (x.op === 'replicate' ? { ...x, n } : x));

/** An advisor whose gateway sees these (fake, never used) keys, so profiles' image and video models count as usable. */
function keyed(env: Record<string, string>) {
  return createAdvisor({ gateway: demoGateway({ demo: false, env }), prompts: recordingPrompts().renderer });
}
const ANTHROPIC = { ANTHROPIC_API_KEY: 'sk-ant-test-not-a-real-key-0000' };
const GEMINI = { GEMINI_API_KEY: 'AIza-test-not-a-real-key-000000000' };
const FAL = { FAL_KEY: 'fal-test-not-a-real-key-0000' };

const fields = (e: CostEstimate) => [
  [e.lowUsd, e.highUsd],
  [e.modelCalls.low, e.modelCalls.high],
  [e.images.low, e.images.high],
  [e.humanMinutes.low, e.humanMinutes.high],
];

describe('estimate: the structure of a recipe times the profile prices', () => {
  const advisor = keyed({ ...ANTHROPIC, ...GEMINI, ...FAL });

  it.each(PROTOCOL_CONFIGS.map((r) => [r.id, r]))('%s: finite, non-negative ranges with low <= high', (_id, recipe) => {
    for (const profile of ['balanced', 'best', 'demo']) {
      const e = advisor.estimate(recipe, profile);
      for (const [low, high] of fields(e)) {
        expect(Number.isFinite(low) && Number.isFinite(high)).toBe(true);
        expect(low).toBeGreaterThanOrEqual(0);
        expect(high).toBeGreaterThanOrEqual(low!);
      }
      expect(e.modelCalls.low).toBeGreaterThan(0);
    }
  });

  it('costs nothing on the demo profile, but still counts calls and your time', () => {
    const e = advisor.estimate(c1, 'demo');
    expect([e.lowUsd, e.highUsd]).toEqual([0, 0]);
    expect(e.modelCalls.low).toBeGreaterThan(4);
    expect(e.humanMinutes.low).toBeGreaterThan(0);
  });

  it('costs more on the best profile than on balanced', () => {
    expect(advisor.estimate(c4, 'best').highUsd).toBeGreaterThan(advisor.estimate(c4, 'balanced').highUsd);
    expect(advisor.estimate(c4, 'balanced').lowUsd).toBeGreaterThan(0);
  });

  it('counts the seeded branches: C2 makes at least twelve calls, C1 at least four builds and four critiques', () => {
    expect(advisor.estimate(c2, 'balanced').modelCalls.low).toBeGreaterThanOrEqual(12);
    expect(advisor.estimate(c1, 'balanced').modelCalls.low).toBeGreaterThanOrEqual(8);
  });

  it('is monotonic in loop caps', () => {
    const caps = [1, 2, 3, 5, 8].map((max) => advisor.estimate(withLoopMax(c4, 'critic-loop', max), 'balanced'));
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i]!.highUsd).toBeGreaterThan(caps[i - 1]!.highUsd);
      expect(caps[i]!.modelCalls.high).toBeGreaterThan(caps[i - 1]!.modelCalls.high);
      expect(caps[i]!.lowUsd).toBe(caps[0]!.lowUsd);
    }
    const authorRounds = [2, 4, 10].map((max) => advisor.estimate(withLoopMax(c6a, 'author-loop', max), 'balanced'));
    expect(authorRounds[1]!.humanMinutes.high).toBeGreaterThan(authorRounds[0]!.humanMinutes.high);
    expect(authorRounds[2]!.highUsd).toBeGreaterThan(authorRounds[1]!.highUsd);
  });

  it('is monotonic in replicate counts', () => {
    const runs = [1, 2, 4, 6].map((n) => advisor.estimate(withReplicas(c1, 'seeded-x4', n), 'balanced'));
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]!.lowUsd).toBeGreaterThan(runs[i - 1]!.lowUsd);
      expect(runs[i]!.highUsd).toBeGreaterThan(runs[i - 1]!.highUsd);
      expect(runs[i]!.modelCalls.low).toBeGreaterThan(runs[i - 1]!.modelCalls.low);
    }
    const ideas = [6, 12, 20].map((n) => advisor.estimate(withReplicas(c2, 'seeded-options', n), 'balanced'));
    expect(ideas[1]!.modelCalls.low).toBeGreaterThan(ideas[0]!.modelCalls.low);
    expect(ideas[2]!.highUsd).toBeGreaterThan(ideas[1]!.highUsd);
  });

  it('counts images only when the profile can make them', () => {
    expect(advisor.estimate(c1, 'balanced').images).toEqual({ low: 0, high: 12 });
    expect(advisor.estimate(c3, 'balanced').images).toEqual({ low: 0, high: 1 });
    const noImages = keyed(ANTHROPIC);
    expect(noImages.estimate(c1, 'balanced').images).toEqual({ low: 0, high: 0 });
    expect(noImages.estimate(c1, 'balanced').highUsd).toBeLessThan(advisor.estimate(c1, 'balanced').highUsd);
  });

  it('prices relay clips by the second only when the profile has a usable video model (ADR-0069)', () => {
    const withVideo = advisor.estimate(c5, 'balanced');
    const without = keyed({ ...ANTHROPIC, ...GEMINI }).estimate(c5, 'balanced');
    const perSecond = 0.07;
    // At least three links of five seconds each, at Kling 2.5 Turbo's price.
    expect(withVideo.lowUsd - without.lowUsd).toBeGreaterThanOrEqual(3 * 5 * perSecond - 1e-9);
    expect(withVideo.highUsd).toBeGreaterThan(without.highUsd);
    expect(withVideo.modelCalls).toEqual(without.modelCalls);
    // The openai profile has no video model at all.
    const openai = keyed({ OPENAI_API_KEY: 'sk-test-not-a-real-key-000000000' }).estimate(c5, 'openai');
    expect(openai.highUsd).toBeGreaterThan(0);
  });

  it("prices a different-family critic at the other family's model when its key is set up (C3), else at the profile's own", () => {
    // C3's critic has family 'other': with an OpenAI key, balanced runs it on GPT-6 Astra ($10/$50 per MTok), dearer
    // than Claude Opus 5.5 ($4/$20); without one, a fresh session of the same family reviews, at Opus prices.
    const OPENAI = { OPENAI_API_KEY: 'sk-test-not-a-real-key-000000000' };
    const same = keyed({ ...ANTHROPIC }).estimate(c3, 'balanced');
    const other = keyed({ ...ANTHROPIC, ...OPENAI }).estimate(c3, 'balanced');
    expect(other.highUsd).toBeGreaterThan(same.highUsd);
    expect(other.modelCalls).toEqual(same.modelCalls);
    // A recipe with no different-family critic costs the same either way.
    expect(keyed({ ...ANTHROPIC, ...OPENAI }).estimate(c4, 'balanced')).toEqual(keyed({ ...ANTHROPIC }).estimate(c4, 'balanced'));
  });

  it('counts your time choosing which cliché-sweep finds to swap (C2)', () => {
    const withChoice = advisor.estimate(c4, 'balanced').humanMinutes;
    const asRender: Node = { op: 'step', id: 'apply-swaps', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] };
    const noSwaps = advisor.estimate(edit(c4, 'apply-swaps', () => asRender), 'balanced').humanMinutes;
    expect(withChoice.low - noSwaps.low).toBeGreaterThanOrEqual(HUMAN_MINUTES.select[0]);
  });

  it('reads the swap step by what it runs (the effects table), not by its writes flag (F08, ADR-0092)', () => {
    const undeclared = edit(c4, 'apply-swaps', (n) => {
      const { writes: _w, ...rest } = n as Extract<Node, { op: 'step' }>;
      return rest as Node;
    });
    expect(advisor.estimate(undeclared, 'balanced')).toEqual(advisor.estimate(c4, 'balanced'));
  });

  it('counts the swap choice only where the interpreter asks it (asksSwaps): not behind a machine keep-or-revert', () => {
    const headless = edit(c4, 'tells-compare', (n) => ({ ...n, actor: 'model', tier: 'mid', prompt: 'study1.A13' }) as Node);
    const asRender: Node = { op: 'step', id: 'apply-swaps', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] };
    const noSwapsHeadless = edit(headless, 'apply-swaps', () => asRender);
    // The headless arm's model keep-or-revert costs a model call either way; what is left is your choosing time, none.
    expect(advisor.estimate(headless, 'balanced').humanMinutes.low - advisor.estimate(noSwapsHeadless, 'balanced').humanMinutes.low).toBe(0);
  });

  it('counts your time by checkpoint: authorship takes longer than polishing a memo', () => {
    const memo = advisor.estimate(c4, 'balanced').humanMinutes;
    const fiction = advisor.estimate(c6a, 'balanced').humanMinutes;
    expect(memo.low).toBeGreaterThan(0);
    expect(fiction.low).toBeGreaterThan(memo.low);
    expect(fiction.high).toBeGreaterThan(memo.high);
  });

  it('takes the cheaper and the dearer branch of an open route', () => {
    const e = advisor.estimate(c3, 'balanced');
    const ai = advisor.estimate(edit(c3, 'draft', (n) => (n.op === 'route' ? { ...n, branches: [n.branches[0]!] } : n)), 'balanced');
    const own = advisor.estimate(edit(c3, 'draft', (n) => (n.op === 'route' ? { ...n, branches: [n.branches[1]!] } : n)), 'balanced');
    expect(e.modelCalls.low).toBe(Math.min(ai.modelCalls.low, own.modelCalls.low));
    expect(e.humanMinutes.high).toBeGreaterThanOrEqual(Math.max(ai.humanMinutes.high, own.humanMinutes.high));
  });

  it('rounds dollars outward to the cent', () => {
    const e = advisor.estimate(c7, 'balanced');
    expect(Math.round(e.lowUsd * 100) / 100).toBe(e.lowUsd);
    expect(Math.round(e.highUsd * 100) / 100).toBe(e.highUsd);
  });

  it('documents its per-role token assumptions', () => {
    for (const role of ['build', 'fix', 'critic', 'judge', 'check', 'cut', 'tells-sweep', 'vision', 'relay', 'asset.briefs']) {
      expect(TOKEN_ASSUMPTIONS[role]).toBeDefined();
    }
  });

  it('rejects a profile the gateway does not know', () => {
    expect(() => advisor.estimate(c4, 'nope')).toThrow(expect.objectContaining({ name: 'AdvisorError', code: 'unknown-profile' }));
  });

  it('can be computed without an advisor, from a profile and prices', () => {
    const balanced = PROFILES.find((p) => p.id === 'balanced')!;
    const direct = estimateRecipe(c4, { profile: balanced, images: true, video: true, at: new Date('2026-10-07T12:00:00Z') });
    expect(direct).toEqual(advisor.estimate(c4, 'balanced'));
  });

  it('is what the demo advisor reports for a recommendation', async () => {
    const { advisor: demo } = demoAdvisor();
    const rec = await demo.recommend({ text: 'A memo about the offsite' }, { workspaceId: 'ws', profileId: 'demo' });
    expect(rec.estimate).toEqual(demo.estimate(c4, 'demo'));
  });
});

describe('estimate in demo mode (Gateway.demo: every call goes to the mock)', () => {
  const demoPriced = keyed({ ...ANTHROPIC, ...GEMINI, ...FAL });

  it('prices with the demo profile whatever profile is asked, so a demo estimate reads $0', () => {
    const { advisor } = demoAdvisor();
    for (const recipe of [c1, c4, c5]) {
      for (const profile of ['balanced', 'best', 'demo']) {
        const e = advisor.estimate(recipe, profile);
        expect(e).toEqual(demoPriced.estimate(recipe, 'demo'));
        expect([e.lowUsd, e.highUsd]).toEqual([0, 0]);
      }
    }
  });

  it("takes image and video availability from the demo profile too (the mock makes both)", () => {
    const { advisor } = demoAdvisor();
    expect(advisor.estimate(c1, 'balanced').images).toEqual({ low: 0, high: 12 });
    expect(advisor.estimate(c1, 'balanced').modelCalls).toEqual(demoPriced.estimate(c1, 'balanced').modelCalls);
  });

  it('is demo mode when forced even with keys, and when there are no keys at all', () => {
    const forced = createAdvisor({ gateway: demoGateway({ demo: true, env: { ...ANTHROPIC } }), prompts: recordingPrompts().renderer });
    expect(forced.estimate(c4, 'balanced').highUsd).toBe(0);
    const keyless = createAdvisor({ gateway: demoGateway({ demo: false, env: {} }), prompts: recordingPrompts().renderer });
    expect(keyless.estimate(c4, 'balanced').highUsd).toBe(0);
    // With a key and demo mode off, the same estimate is priced.
    expect(keyed(ANTHROPIC).estimate(c4, 'balanced').highUsd).toBeGreaterThan(0);
  });

  it('still rejects a profile the gateway does not know (the gateway refuses it in demo mode too)', () => {
    const { advisor } = demoAdvisor();
    expect(() => advisor.estimate(c4, 'nope')).toThrow(expect.objectContaining({ name: 'AdvisorError', code: 'unknown-profile' }));
  });

  it('reads $0 on recommendations and compositions made with a priced profile in demo mode', async () => {
    const { advisor } = demoAdvisor();
    const ws = { workspaceId: 'ws', profileId: 'best' };
    const rec = await advisor.recommend({ text: 'A landing page for my neighborhood bakery' }, ws);
    expect([rec.estimate.lowUsd, rec.estimate.highUsd]).toEqual([0, 0]);
    const composed = await advisor.compose({ text: 'A detailed strategy memo on the billing migration' }, ws);
    expect([composed.estimate.lowUsd, composed.estimate.highUsd]).toEqual([0, 0]);
  });
});
