/**
 * The text configurations end to end: C4 Memo Polish (prose), C6a Fiction Second Reader (your draft, readers who only
 * point), C7 Lean Code Review (code-diff) and C3 Series Writer (the route choice, illustrated prose).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { c3, c4, c6a, c7 } from '@byway/catalog';
import { OK_FALLBACK_NOTE } from '../../src/activities/critic.ts';
import { splitCodeDiff } from '../../src/formats.ts';
import { BEST_SO_FAR_PROMPT, READY_PROMPT } from '../../src/workflow/wording.ts';
import { checkEvents, notes, ofType } from '../helpers/events.ts';
import { AUTHOR_DRAFT, type Harness } from '../helpers/harness.ts';

let h: Harness;

const text = (id: string) => h.store.artifacts.getText(id);

/** Registers these scenarios on the test file's shared harness (one Temporal server and worker per file). */
export function textMediaScenarios(use: () => Harness): void {
  beforeAll(() => {
    h = use();
  });

  describe('C4 on prose', () => {
    it('runs end to end: framings, your brief, a draft, the recipient critic in OK mode, distill, your key lines, the claim log', async () => {
      const mine = 'Decision needed by Friday: approve the second migration window.';
      const run = await h.start(c4, { problem: { text: 'A status memo for leadership on the billing migration, 3 weeks in' } });
      const view = await h.drive(run.id, (cp) => {
        if (cp.stepId === 'voice') return { checkpointId: cp.id, text: `${mine}\n\n${cp.initialText}` };
        return undefined;
      });
      expect(view.run.status).toBe('done');
      checkEvents(view, 'c4');
      const purposes = h.succeeded(run.id).map((c) => c.purpose);
      expect(purposes).toEqual(expect.arrayContaining(['vision:prose', 'build:prose', 'critic:prose', 'fix:prose', 'tells-sweep:prose']));
      // Optionals asked with their triggers.
      expect(view.checkpoints.find((c) => c.stepId === 'recipient-critic')?.prompt).toBe('Run this step? It is meant for when the document is longer than about 300 words.');
      // The framings are shown with your brief's checkpoint; your reaction (text) became the brief the draft used.
      const framings = ofType(view, 'step-finished', 'framings')[0]!.data.outputArtifactIds as string[];
      expect(view.checkpoints.find((c) => c.stepId === 'vision-lite')?.artifactIds).toEqual(framings);
      expect(h.prompts.calls.filter((c) => c.id === 'product.c4.draft').at(-1)!.slots.brief).toBe('Warmer and plainer, please; avoid jargon.');
      // A GREAT critic with no references scored instead, said so, and the loop held it to the hidden 9/10.
      expect(notes(view, 'recipient').every((n) => n === OK_FALLBACK_NOTE)).toBe(true);
      const iterations = ofType(view, 'loop-iteration', 'critic-loop');
      expect(iterations.length).toBeGreaterThanOrEqual(1);
      expect(iterations.every((e) => typeof e.data.score === 'number' && e.data.max === 2)).toBe(true);
      const lastScore = iterations.at(-1)!.data.score as number;
      if (lastScore < 9) expect(view.checkpoints.some((c) => c.prompt === BEST_SO_FAR_PROMPT)).toBe(true);
      // The tells sweep got the catalog for prose; the worker turns never did (port rule 7).
      expect(h.prompts.calls.filter((c) => c.id === 'product.c4.tells-sweep').at(-1)!.slots.tells).toContain('delve');
      expect(h.prompts.calls.filter((c) => c.id === 'product.c4.draft' || c.id === 'product.c4.revise').every((c) => c.slots.tells === undefined)).toBe(true);
      // Your key lines are the deliverable, word for word; the claim log asked you to sign off.
      expect(await text(view.run.outputArtifactId!)).toContain(mine);
      expect(view.checkpoints.find((c) => c.stepId === 'claim-sign-off')).toMatchObject({ kind: 'write' });
    }, 120_000);
  });

  describe('C6a on prose', () => {
    it('your draft by a write checkpoint, three readers who only point, your call when it is done; no model writes a sentence', async () => {
      let ready = 0;
      const revision = `${AUTHOR_DRAFT}\nShe stopped counting after that.\n`;
      const run = await h.start(c6a, { problem: { text: 'A short story about a lighthouse keeper who counts boats' }, inputs: { draft: AUTHOR_DRAFT } });
      const view = await h.drive(run.id, (cp) => {
        if (cp.stepId === 'pick-card') return { checkpointId: cp.id, choice: ['C'] };
        if (cp.stepId === 'write') return { checkpointId: cp.id, text: ready === 0 ? cp.initialText! : revision };
        if (cp.prompt === READY_PROMPT && cp.stepId === 'author-loop') return { checkpointId: cp.id, approved: ++ready > 1 };
        return undefined;
      });
      expect(view.run.status).toBe('done');
      checkEvents(view, 'c6a');
      const writes = view.checkpoints.filter((c) => c.stepId === 'write');
      expect(writes.map((c) => c.initialText)).toEqual([AUTHOR_DRAFT, AUTHOR_DRAFT]);
      expect(ofType(view, 'loop-iteration', 'author-loop').map((e) => e.data.iteration)).toEqual([1, 2]);
      // Each round three readers point: removals, flagged tells, a critique. Their notes are kept as artifacts.
      for (const reader of ['cut-marks', 'tells-flags', 'critic']) {
        expect(ofType(view, 'step-finished', reader)).toHaveLength(2);
        expect(ofType(view, 'step-finished', reader).every((e) => (e.data.outputArtifactIds as string[]).length === 1)).toBe(true);
      }
      const purposes = new Set(h.succeeded(run.id).filter((c) => c.stepId && ['write', 'render', 'cut-marks', 'tells-flags', 'critic', 'voice'].includes(c.stepId)).map((c) => c.purpose));
      expect([...purposes].sort()).toEqual(['critic:prose', 'cut:prose', 'tells-sweep:prose']);
      // The deliverable is your revision, exactly.
      expect(await text(view.run.outputArtifactId!)).toBe(revision);
      // The final read is a flags-only lens.
      expect(ofType(view, 'step-finished', 'final-tells-flags')).toHaveLength(1);
    }, 120_000);
  });

  describe('C7 on code-diff', () => {
    it('runs end to end: implement, defect check, scope cut, the review loop, the bloat cut, the sweep and your why', async () => {
      const why = 'Why: the helper was used once; inlining it keeps the output and removes a name to look up. Verified with the formatter tests.';
      const run = await h.start(c7, { problem: { text: 'Trim this agent-written refactor of the invoice formatter' } });
      const view = await h.drive(run.id, (cp) => {
        if (cp.stepId === 'spec-interview') return { checkpointId: cp.id, approved: false };
        if (cp.stepId === 'voice') return { checkpointId: cp.id, text: why };
        return undefined;
      });
      expect(view.run.status).toBe('done');
      checkEvents(view, 'c7');
      const purposes = h.succeeded(run.id).map((c) => c.purpose);
      expect(new Set(purposes)).toEqual(new Set(['build:code-diff', 'check:code-diff', 'fix:code-diff', 'cut:code-diff', 'critic:code-diff', 'tells-sweep:code-diff', ...(purposes.includes('rerank:code-diff') ? ['rerank:code-diff'] : [])]));
      expect(view.checkpoints.find((c) => c.stepId === 'voice')?.initialText).toMatch(/^Why: /);
      const out = await text(view.run.outputArtifactId!);
      const { diff, why: kept } = splitCodeDiff(out);
      expect(diff).toMatch(/^--- a\/.+\n\+\+\+ b\/.+\n@@ /);
      expect(kept).toBe(why);
      expect((await h.store.artifacts.get(view.run.outputArtifactId!)).record.mediaType).toBe('text/x-diff');
      // The reviewer judges the diff as its view: never the artifact slot (port rule 1).
      expect(h.prompts.calls.filter((c) => c.id === 'product.c7.reviewer').every((c) => c.slots.artifact === undefined && c.slots.view?.startsWith('--- a/'))).toBe(true);
    }, 120_000);
  });

  describe('C3 on prose', () => {
    it('asks who writes the first draft, takes yours, and illustrates the piece on request', async () => {
      const run = await h.start(c3, { problem: { text: 'A newsletter piece on teaching fractions with recipes' }, inputs: { draft: AUTHOR_DRAFT } });
      const view = await h.drive(run.id, (cp) => (cp.kind === 'choose' ? { checkpointId: cp.id, choice: ['own'] } : undefined));
      expect(view.run.status).toBe('done');
      checkEvents(view, 'c3');
      const choose = view.checkpoints.find((c) => c.kind === 'choose')!;
      expect(choose).toMatchObject({ stepId: 'draft', prompt: 'Choose: who writes the first draft.' });
      expect(choose.options?.map((o) => o.id)).toEqual(['ai', 'own']);
      expect(view.checkpoints.find((c) => c.stepId === 'own-draft')).toMatchObject({ kind: 'write', initialText: AUTHOR_DRAFT });
      expect(h.succeeded(run.id).some((c) => c.stepId === 'ai-draft')).toBe(false);
      // ASSET on prose: briefs, one image (slots: 1), then the model places it as a Markdown image line.
      const purposes = h.succeeded(run.id).filter((c) => c.stepId === 'asset').map((c) => c.purpose);
      expect(purposes).toEqual(['asset.briefs:prose', 'asset:prose', 'asset.integrate:prose']);
      const integrate = h.prompts.calls.filter((c) => c.id === 'helper.asset.integrate').at(-1)!;
      expect(integrate.slots.images).toMatch(/^!\[[^\]]*\]\(\/api\/artifacts\/sha256:[0-9a-f]{64}\)$/);
      expect(await text(view.run.outputArtifactId!)).toMatch(/!\[[^\]]*\]\(\/api\/artifacts\/sha256:[0-9a-f]{64}\)/);
    }, 120_000);
  });
}
