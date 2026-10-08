import { c1, c3, c4, c5, c6, c6a, PROTOCOL_CONFIGS } from '@byway/catalog';
import { steps, withHash, type Recipe } from '@byway/recipe';
import { validate } from '@byway/validator';
import { describe, expect, it } from 'vitest';
import { alwaysRunSteps, catalogPrompts, checkAnswer, checkComposedProfile } from '../src/index.ts';
import { fencedJson, recordingPrompts } from './helpers.ts';

const prompts = recordingPrompts().renderer;
const ctx = (nearest: Recipe) => ({ nearest, catalog: PROTOCOL_CONFIGS, prompts });

describe('the composed profile on the canonical recipes themselves', () => {
  it.each(PROTOCOL_CONFIGS.map((r) => [r.id, r]))('%s, recomposed as itself, passes the profile and validates', (_id, recipe) => {
    const candidate = checkAnswer(fencedJson(recipe), recipe, { prompts, catalog: PROTOCOL_CONFIGS }, `composed-${recipe.id}`);
    expect(candidate.violations).toEqual([]);
    expect(candidate.recipe).toMatchObject({ kind: 'composed', channel: 'workspace', family: recipe.family });
    expect(validate(candidate.recipe!).ok).toBe(true);
  });

  it('every model step of the catalog names a prompt the catalog uses for its role', () => {
    const roles = catalogPrompts(PROTOCOL_CONFIGS);
    for (const r of PROTOCOL_CONFIGS) for (const { step } of steps(r)) if (step.actor === 'model') expect(roles.get(step.prompt!)?.has(step.role)).toBe(true);
  });
});

describe('protected checkpoints', () => {
  const ids = (r: Recipe) => alwaysRunSteps(r).map((s) => s.id);

  it('counts only steps every run passes through', () => {
    expect(ids(c4)).toContain('voice');
    expect(ids(c4)).not.toContain('claim-sign-off');
    expect(ids(c4)).not.toContain('recipient');
    expect(ids(c3)).not.toContain('own-draft');
    expect(ids(c6)).toContain('write');
  });

  it('protects authorship where every run has you write (C6, C6a), not where it is one branch of a choice (C3)', () => {
    const aiDrafted = (from: Recipe): Recipe => withHash({ ...c4, id: 'composed-x', kind: 'composed', channel: 'workspace', family: from.family, exceptions: [] });
    const rules = (nearest: Recipe) => checkComposedProfile(aiDrafted(nearest), ctx(nearest)).map((v) => v.ruleId);
    expect(rules(c6)).toContain('COMPOSED-AUTHOR');
    expect(rules(c6a)).toContain('COMPOSED-AUTHOR');
    expect(rules(c3)).not.toContain('COMPOSED-AUTHOR');
  });

  it('protects VOICE for every configuration that has one', () => {
    for (const nearest of PROTOCOL_CONFIGS) {
      const voiceless = withHash({
        ...nearest,
        id: 'composed-y',
        kind: 'composed',
        channel: 'workspace',
        stages: nearest.stages.map((s) => (s.body.op === 'step' && s.body.role === 'voice' ? { ...s, body: { ...s.body, actor: 'model' as const } } : s.body.op === 'seq' ? { ...s, body: { ...s.body, steps: s.body.steps.map((n) => (n.op === 'step' && n.role === 'voice' ? { ...n, actor: 'model' as const } : n)) } } : s)),
      });
      expect(checkComposedProfile(voiceless, ctx(nearest)).map((v) => v.ruleId)).toContain('COMPOSED-VOICE');
    }
  });
});

/**
 * COMP-1: a composed recipe may not keep the protected checkpoints in name only. The four probes the review ran through
 * checkAnswer were all accepted before: an AI rewrite of the author's text in C6a (inside the author's loop, and after
 * it), and a model writer after the person's own words in C1 and C4 (declared keepsVoice, which only checks that the
 * person's lines survive, so added AI copy passed).
 */
describe('protected checkpoints are kept in substance, not just in name (COMP-1)', () => {
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  const offer = (raw: unknown, nearest: Recipe) => checkAnswer(fencedJson(raw), nearest, { prompts, catalog: PROTOCOL_CONFIGS }, 'composed-probe').violations.map((v) => v.ruleId);
  type Raw = { stages: { body: { op: string; steps: Record<string, unknown>[]; body?: { steps: Record<string, unknown>[] } } }[] };
  const modelWriter = (id: string, prompt: string, extra: Record<string, unknown> = {}) => ({
    op: 'step', id, role: 'fix', actor: 'model', tier: 'mid', prompt, consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true, ...extra,
  });

  it('refuses a C6a whose author loop has the AI rewrite the draft after each write', () => {
    const r = clone(c6a) as unknown as Raw;
    const loop = r.stages[1]!.body as unknown as { body: { steps: Record<string, unknown>[] } };
    loop.body.steps.splice(1, 0, modelWriter('ai-rewrite', 'product.c3.revise'));
    expect(offer(r, c6a)).toContain('COMPOSED-AUTHOR');
  });

  it('refuses a C6a that has the AI rewrite the whole text after the author loop', () => {
    const r = clone(c6a) as unknown as Raw;
    r.stages[1]!.body = { op: 'seq', steps: [r.stages[1]!.body as unknown as Record<string, unknown>, modelWriter('ai-polish', 'product.c3.revise')] };
    expect(offer(r, c6a)).toContain('COMPOSED-AUTHOR');
  });

  it('refuses a C1 with a model writer after your own words, even one declared to keep them', () => {
    const r = clone(c1) as unknown as Raw;
    const d3 = r.stages[2]!.body.steps;
    d3.splice(d3.findIndex((s) => s.id === 'voice') + 1, 0, modelWriter('post-voice-fix', 'article.CRIT-W', { keepsVoice: true }));
    expect(offer(r, c1)).toContain('COMPOSED-VOICE');
  });

  it('refuses a C4 with a model revise after your own words, even one declared to keep them', () => {
    const r = clone(c4) as unknown as Raw;
    const d3 = r.stages[2]!.body.steps;
    d3.splice(d3.findIndex((s) => s.id === 'voice') + 1, 0, modelWriter('post-voice-revise', 'product.c4.revise', { keepsVoice: true }));
    expect(offer(r, c4)).toContain('COMPOSED-VOICE');
  });

  it("allows what the nearest recipe itself does after your words: C5's production keeps your locked script", () => {
    // C5 writes media after the voice-over is locked (frames, clips, swaps that keep it verbatim); a composed C5 that
    // does the same is not a breach, but one more model writer after your words is.
    expect(offer(c5, c5)).toEqual([]);
    const r = clone(c5) as unknown as Raw;
    const d3 = r.stages[2]!.body.steps;
    d3.splice(d3.findIndex((s) => s.id === 'voice') + 1, 0, modelWriter('post-voice-swaps', 'product.c5.apply-swaps', { keepsVoice: true }));
    expect(offer(r, c5)).toContain('COMPOSED-VOICE');
  });

  it('still allows the author-only recipes their readers, and C3 its revise after your own draft', () => {
    for (const nearest of [c3, c6, c6a]) expect(offer(nearest, nearest), nearest.id).toEqual([]);
  });
});
