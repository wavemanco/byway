/**
 * C1 Landing Page Studio end to end (web-page): four seeded candidates, each through a critic loop with a hidden
 * threshold, an optional ASSET on one of them, a person's pick, and the D3 checkpoints (trim, keep-or-revert, your
 * words) before the final defect check. Renders are faked here (pages.test.ts renders a real page).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { c1 } from '@byway/catalog';
import type { CompletionRequest, RunView } from '@byway/contracts';
import { pageCopy, skeleton } from '../src/copy.ts';
import { BEST_SO_FAR_PROMPT } from '../src/workflow/wording.ts';
import { checkEvents, ofType } from './helpers/events.ts';
import { createHarness, type Harness } from './helpers/harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 120_000);
afterAll(async () => {
  await h?.close();
}, 60_000);

const round = (prompt: string) => Number(/Round: (\d+)/.exec(prompt)?.[1] ?? 1);
const byCandidate = (view: RunView, type: Parameters<typeof ofType>[1], stepId: string) => {
  const out = new Map<number, number>();
  for (const e of ofType(view, type, stepId)) out.set(e.candidate ?? -1, (out.get(e.candidate ?? -1) ?? 0) + 1);
  return out;
};

describe('C1 on web-page', () => {
  it('runs end to end: loops stop at the hidden threshold, ASSET on request, your pick, your words', async () => {
    // The critic's score rises with the round it is shown (the round is in its prompt, never the bar): 6, then 9.
    h.responders['critic:web-page'] = (ctx) => `- The headline is generic.\n- The action competes with the menu.\nScore: ${round(ctx.prompt) >= 2 ? 9 : 6}/10`;
    let pickOptions: string[] = [];
    let beforeVoice = '';
    let editedCopy: string[] = [];
    try {
      const run = await h.start(c1);
      const view = await h.drive(run.id, (cp) => {
        if (cp.stepId === 'asset-if-plain') return { checkpointId: cp.id, approved: cp.candidate === 0 };
        if (cp.kind === 'pick') {
          pickOptions = cp.options!.map((o) => o.artifactId!);
          return { checkpointId: cp.id, choice: ['A'] };
        }
        if (cp.kind === 'compare') return { checkpointId: cp.id, choice: ['B'] };
        if (cp.kind === 'write') {
          const lines = cp.initialText!.split('\n');
          beforeVoice = cp.artifactIds![0]!;
          editedCopy = lines.map((l, i) => (i === 1 ? 'Sourdough at your door by six' : l));
          return { checkpointId: cp.id, text: editedCopy.join('\n') };
        }
        return undefined;
      });
      expect(view.run.status).toBe('done');
      checkEvents(view, 'c1');

      // D1: four seeded builds, each with its own random string.
      const seeds = h.succeeded(run.id).filter((c) => c.purpose === 'seed:web-page');
      expect(seeds).toHaveLength(4);
      const seedSlots = h.prompts.calls.filter((c) => c.id === 'article.SEED').slice(-4).map((c) => c.slots.seed);
      expect(new Set(seedSlots).size).toBe(4);

      // D2: each candidate's loop stops at round 2, right after the critic (no fix after the passing score).
      expect([...byCandidate(view, 'loop-iteration', 'critic-loop').values()]).toEqual([2, 2, 2, 2]);
      expect(ofType(view, 'loop-iteration', 'critic-loop').filter((e) => e.data.iteration === 2).every((e) => e.data.score === 9)).toBe(true);
      expect([...byCandidate(view, 'step-started', 'critic-fix').values()]).toEqual([1, 1, 1, 1]);
      // The critic sees screenshots only: no source (port rule 1), no threshold (port rule 2).
      for (const c of h.prompts.calls.filter((x) => x.id === 'runbook.critic-ok')) {
        expect(c.slots.artifact).toBeUndefined();
        expect(c.user).not.toMatch(/9\/10|threshold/);
      }
      const criticCall = h.succeeded(run.id).find((c) => c.purpose === 'critic:web-page')!.request as CompletionRequest;
      expect(criticCall.tier).toBe('big');
      expect(criticCall.messages[0]!.content.some((p) => p.type === 'image')).toBe(true);

      // ASSET only where a person said the design was plain: briefs, images, then the model places them.
      const assetCalls = h.succeeded(run.id).filter((c) => c.purpose.startsWith('asset'));
      expect(assetCalls.map((c) => c.purpose).filter((p, i, a) => a.indexOf(p) === i)).toEqual(['asset.briefs:web-page', 'asset:web-page', 'asset.integrate:web-page']);
      expect(assetCalls.every((c) => c.stepId === 'asset')).toBe(true);
      const withImages = await h.store.artifacts.getText(pickOptions[0]!);
      expect(withImages).toMatch(/src="\/api\/artifacts\/sha256:[0-9a-f]{64}"/);
      expect(byCandidate(view, 'step-started', 'asset').get(0)).toBe(1);
      expect(byCandidate(view, 'step-started', 'asset').get(1)).toBeUndefined();

      // The pick shows the four candidates; D3 works on the one picked (A, the one with images).
      expect(pickOptions).toHaveLength(4);
      const pick = view.checkpoints.find((c) => c.kind === 'pick')!;
      expect(pick).toMatchObject({ stepId: 'pick-one', k: 1 });

      // Your words: placed verbatim, nothing but text changed (voice.apply, held to the diff check).
      expect(h.succeeded(run.id).some((c) => c.purpose === 'voice.apply:web-page')).toBe(true);
      const out = await h.store.artifacts.getText(view.run.outputArtifactId!);
      expect(pageCopy(out)).toContain('Sourdough at your door by six');
      expect(skeleton(out)).toBe(skeleton(await h.store.artifacts.getText(beforeVoice)));
      expect(pageCopy(out)).toEqual(editedCopy.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean));

      // The final defect check found nothing.
      const check = ofType(view, 'step-finished', 'critic-check')[0]!;
      expect(await h.store.artifacts.getText((check.data.outputArtifactIds as string[])[0]!)).toContain('No defects.');
      // Every D3 checkpoint opened: trim, keep-or-revert, your words.
      expect(view.checkpoints.filter((c) => ['directive', 'compare', 'write'].includes(c.kind)).map((c) => c.stepId)).toEqual(['cut', 'tells-compare', 'voice']);
    } finally {
      delete h.responders['critic:web-page'];
    }
  }, 120_000);

  it('at the cap, re-ranks the best versions in a fresh call and asks whether to use the best so far', async () => {
    // Rising slowly but steadily: converging, no plateau, never at the bar.
    h.responders['critic:web-page'] = (ctx) => `- The spacing is uniform.\nScore: ${(5 + 0.6 * round(ctx.prompt)).toFixed(1)}/10`;
    try {
      const run = await h.start(c1);
      const view = await h.drive(run.id, (cp) => (cp.stepId === 'asset-if-plain' ? { checkpointId: cp.id, approved: false } : undefined));
      expect(view.run.status).toBe('done');
      checkEvents(view, 'c1');
      expect([...byCandidate(view, 'loop-iteration', 'critic-loop').values()]).toEqual([5, 5, 5, 5]);
      // Four fixes per candidate: none after the fifth critique.
      expect([...byCandidate(view, 'step-started', 'critic-fix').values()]).toEqual([4, 4, 4, 4]);
      const reranks = h.succeeded(run.id).filter((c) => c.purpose === 'rerank:web-page');
      expect(reranks).toHaveLength(4);
      expect(reranks.every((c) => c.stepId === 'critic-loop')).toBe(true);
      // The re-rank sees the top three versions as labelled screenshots, with no scores or critiques.
      const rr = reranks[0]!.request as CompletionRequest;
      expect(rr.messages[0]!.content.filter((p) => p.type === 'image')).toHaveLength(3);
      expect(JSON.stringify(rr.messages)).not.toMatch(/Score|spacing is uniform/);
      const caps = view.checkpoints.filter((c) => c.prompt === BEST_SO_FAR_PROMPT);
      expect(caps).toHaveLength(4);
      expect(caps.every((c) => c.stepId === 'critic-loop' && c.kind === 'confirm' && c.artifactIds?.length === 1)).toBe(true);
    } finally {
      delete h.responders['critic:web-page'];
    }
  }, 120_000);
});
