/**
 * The text configurations end to end: C4 Memo Polish (prose), C6a Fiction Second Reader (your draft, readers who only
 * point), C7 Lean Code Review (code-diff) and C3 Series Writer (the route choice, illustrated prose).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { CompletionRequest } from '@byway/contracts';
import { c3, c4, c6a, c7 } from '@byway/catalog';
import { OK_FALLBACK_NOTE } from '../../src/activities/critic.ts';
import { splitCodeDiff } from '../../src/formats.ts';
import { BEST_SO_FAR_PROMPT, DECLINED_NOTE, READY_PROMPT, SPEC_IN_PLACE_PROMPT } from '../../src/workflow/wording.ts';
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
      const correction = 'The pilot runs for 3 weeks, starting on the 2nd.';
      let wrong = '';
      const run = await h.start(c4, { problem: { text: 'A status memo for leadership on the billing migration, 3 weeks in' } });
      const view = await h.drive(run.id, (cp) => {
        if (cp.stepId === 'voice') return { checkpointId: cp.id, text: `${mine}\n\n${cp.initialText}` };
        if (cp.stepId === 'claim-sign-off') {
          // The owner corrects the last claim (ENG-2); the others are signed off as they are.
          const lines = cp.initialText!.split('\n');
          wrong = lines.at(-1)!.replace(/^- /, '');
          return { checkpointId: cp.id, text: [...lines.slice(0, -1), `- ${correction}`].join('\n') };
        }
        return undefined;
      });
      expect(view.run.status).toBe('done');
      checkEvents(view, 'c4');
      const purposes = h.succeeded(run.id).map((c) => c.purpose);
      expect(purposes).toEqual(expect.arrayContaining(['vision:prose', 'build:prose', 'critic:prose', 'fix:prose', 'tells-sweep:prose']));
      // Optionals asked with their triggers.
      expect(view.checkpoints.find((c) => c.stepId === 'recipient-critic')?.prompt).toBe('Run this step? It is meant for when the document is longer than about 300 words. Yes runs it; No skips it.');
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
      // The tells sweep got the step's own catalog (its domain: memo); the worker turns never did (port rule 7).
      const tells = h.prompts.calls.filter((c) => c.id === 'product.c4.tells-sweep').at(-1)!.slots.tells!;
      expect(tells).toContain('delve');
      expect([...tells.matchAll(/\((tells\.[a-z-]+)\)/g)].map((m) => m[1])).toEqual(['tells.memo']);
      expect(h.prompts.calls.filter((c) => c.id === 'product.c4.draft' || c.id === 'product.c4.revise').every((c) => c.slots.tells === undefined)).toBe(true);
      // Your key lines are the deliverable, word for word; the claim log asked you to sign off, and your correction
      // replaced the claim in the deliverable (ENG-2).
      const out = await text(view.run.outputArtifactId!);
      expect(out).toContain(mine);
      const claims = view.checkpoints.find((c) => c.stepId === 'claim-sign-off')!;
      expect(claims).toMatchObject({ kind: 'write' });
      expect(out).toContain(correction);
      expect(wrong).not.toBe('');
      expect(out.replace(/\s+/g, ' ')).not.toContain(wrong);
      expect(ofType(view, 'step-finished', 'claim-sign-off')[0]!.data.outputArtifactIds).toEqual([view.run.outputArtifactId]);
      // The claims offered are sentences, once each: no doubled list markers, no demo marker (UX-5, UX-6).
      expect(claims.initialText).not.toMatch(/^- - |byway-demo-revision/m);
      expect(claims.initialText!.split('\n').length).toBeGreaterThan(3);
    }, 120_000);
  });

  describe('C4 with references (GREAT mode, ADR-0072)', () => {
    it('ranks our draft blind among four exemplars; each round shows our rank of five, and the loop stops at the hidden middle', async () => {
      const refs: string[] = [];
      for (const n of ['one', 'two', 'three', 'four']) refs.push((await h.store.artifacts.putText(`# Exemplar ${n}\n\nDecision needed: ${n}.\n`, 'text/markdown')).id);
      const from = h.prompts.calls.length;
      const own = '- "synergy" → say what the teams do together';
      const run = await h.start(c4, { problem: { text: 'A status memo for leadership on the billing migration, 3 weeks in' }, inputs: { refs, tells: own } });
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('done');
      checkEvents(view, 'c4');
      const rendered = h.prompts.calls.slice(from);
      expect(notes(view, 'recipient').every((n) => n === undefined)).toBe(true);
      // The demo critic ranks a first draft fourth of five, and the revision second: at or above the middle (rank 3).
      const iterations = ofType(view, 'loop-iteration', 'critic-loop');
      expect(iterations.map((e) => e.data)).toEqual([
        { iteration: 1, max: 2, rank: 4, of: 5 },
        { iteration: 2, max: 2, rank: 2, of: 5 },
      ]);
      // Every round the lineup slots say nothing about which item is ours, and the fix got only our item's critique.
      const critics = rendered.filter((c) => c.id === 'product.c4.recipient');
      expect(critics.map((c) => c.slots.labels)).toEqual(['5 items, labelled A–E', '5 items, labelled A–E']);
      const revise = rendered.filter((c) => c.id === 'product.c4.revise');
      expect(revise).toHaveLength(1);
      expect(revise[0]!.slots.critique).toMatch(/^- Intent: /);
      expect(revise[0]!.slots.critique).not.toMatch(/^###/m);
      // The run brought its own tell catalog (StartRunInput.inputs.tells): the sweep used it instead of the memo one.
      expect(rendered.filter((c) => c.id === 'product.c4.tells-sweep').map((c) => c.slots.tells)).toEqual([own]);
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
      // "The readers' notes are beside it": round 2's write shows your draft and the three notes of round 1, and each
      // "Is this ready?" shows the draft with the notes it is about (ENG-8).
      const firstNotes = ['cut-marks', 'tells-flags', 'critic'].map((r) => (ofType(view, 'step-finished', r)[0]!.data.outputArtifactIds as string[])[0]!);
      expect(writes[1]!.artifactIds).toEqual(expect.arrayContaining(firstNotes));
      expect(writes[1]!.artifactIds![0]).toBe((ofType(view, 'step-finished', 'write')[0]!.data.outputArtifactIds as string[])[0]);
      const readies = view.checkpoints.filter((c) => c.prompt === READY_PROMPT && c.stepId === 'author-loop');
      expect(readies[0]!.artifactIds).toEqual(expect.arrayContaining(firstNotes));
      // The vision loop's question shows the sharpened brief, not only the card it started from.
      const sharpened = (ofType(view, 'step-finished', 'sharpen')[0]!.data.outputArtifactIds as string[])[0]!;
      expect(view.checkpoints.find((c) => c.prompt === READY_PROMPT && c.stepId !== 'author-loop')?.artifactIds).toContain(sharpened);
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
      // The spec interview you declined is a step that was skipped, and says why (UX-1, convention C1).
      expect(ofType(view, 'step-finished', 'spec-interview').map((e) => e.data)).toEqual([{ costUsd: 0, skipped: true, note: DECLINED_NOTE }]);
      expect(DECLINED_NOTE).toBe('You chose not to run this step.');
      expect(view.checkpoints.find((c) => c.stepId === 'spec-interview')?.prompt).toBe('Run this step? It is meant for when the requirements are vague. Yes runs it; No skips it.');
      const purposes = h.succeeded(run.id).map((c) => c.purpose);
      expect(new Set(purposes)).toEqual(new Set(['build:code-diff', 'check:code-diff', 'fix:code-diff', 'cut:code-diff', 'critic:code-diff', 'tells-sweep:code-diff', ...(purposes.includes('rerank:code-diff') ? ['rerank:code-diff'] : [])]));
      expect(view.checkpoints.find((c) => c.stepId === 'voice')?.initialText).toMatch(/^Why: /);
      // The demo's revision marker stays in the stored work and never reaches the person (UX-6).
      expect(view.checkpoints.find((c) => c.stepId === 'voice')?.initialText).not.toContain('byway-demo-revision');
      const out = await text(view.run.outputArtifactId!);
      const { diff, why: kept } = splitCodeDiff(out);
      expect(diff).toMatch(/^--- a\/.+\n\+\+\+ b\/.+\n@@ /);
      expect(kept).toBe(why);
      expect((await h.store.artifacts.get(view.run.outputArtifactId!)).record.mediaType).toBe('text/x-diff');
      // The reviewer judges the diff as its view: never the artifact slot (port rule 1).
      expect(h.prompts.calls.filter((c) => c.id === 'product.c7.reviewer').every((c) => c.slots.artifact === undefined && c.slots.view?.startsWith('--- a/'))).toBe(true);
      // A reviewer from another AI family (FID-1): in demo mode the demo profile's stand-in, recorded as such.
      const reviews = h.succeeded(run.id).filter((c) => c.stepId === 'reviewer');
      expect(reviews.length).toBeGreaterThan(0);
      expect(reviews.every((c) => (c.request as CompletionRequest).model?.model === 'mock-other')).toBe(true);
      expect(h.ledger(run.id).filter((e) => e.stepId === 'reviewer').every((e) => e.requestedModel === 'mock-other')).toBe(true);
      expect(notes(view, 'reviewer').every((n) => !n?.includes('another AI family'))).toBe(true);
      // With the interview declined there is no spec: implement works from the request alone (ADR-0089).
      const implement = h.prompts.calls.filter((c) => c.id === 'product.c7.implement').filter((c) => c.slots.problem?.includes('invoice formatter'));
      expect(implement.at(-1)!.slots.brief).toBe('');
      expect(JSON.stringify((h.succeeded(run.id).find((c) => c.stepId === 'implement')!.request as CompletionRequest).messages)).not.toContain('Brief:');
    }, 120_000);

    it('with the interview: you answer its questions in place, and implement works from the whole spec (F09)', async () => {
      const questions = ['1. Must the CSV header stay as it is? Default: yes, unchanged.', '2. Which locale formats the amounts? Default: en-US.', '3. Should rounding change? Default: no.'].join('\n');
      h.responders['vision:code-diff'] = () => questions;
      try {
        const run = await h.start(c7, { problem: { text: 'Make the invoice export handle currencies; the request is vague' } });
        let offered: string | undefined;
        const view = await h.drive(run.id, (cp) => {
          if (cp.stepId !== 'spec') return undefined;
          offered = cp.initialText;
          // You change only question 2; the others keep the defaults you were shown.
          return { checkpointId: cp.id, text: cp.initialText!.replace('Default: en-US.', 'Answer: the customer’s own locale, from their profile.') };
        });
        expect(view.run.status).toBe('done');
        checkEvents(view, 'c7');
        // The spec checkpoint opens with the interview's questions and defaults, and asks you to answer them in place.
        expect(offered).toBe(questions);
        expect(view.checkpoints.find((c) => c.stepId === 'spec')).toMatchObject({ kind: 'react', prompt: SPEC_IN_PLACE_PROMPT });
        // Implement's spec holds question 1 with its default and question 2 with your answer, and the request carries both.
        const brief = h.prompts.calls.filter((c) => c.id === 'product.c7.implement').at(-1)!.slots.brief!;
        expect(brief).toContain('1. Must the CSV header stay as it is? Default: yes, unchanged.');
        expect(brief).toContain('2. Which locale formats the amounts? Answer: the customer’s own locale, from their profile.');
        const request = JSON.stringify((h.succeeded(run.id).find((c) => c.stepId === 'implement')!.request as CompletionRequest).messages);
        expect(request).toContain('Default: yes, unchanged.');
        expect(request).toContain('from their profile');
        // The blind passes never see the spec (C7-DR7).
        for (const id of ['product.c7.scope-cut', 'product.c7.reviewer', 'product.c7.bloat-cut', 'product.c7.review-fix']) {
          expect(h.prompts.calls.filter((c) => c.id === id).every((c) => c.slots.brief === undefined), id).toBe(true);
        }
      } finally {
        delete h.responders['vision:code-diff'];
      }
    }, 120_000);
  });

  describe('C3 on prose', () => {
    it('asks who writes the first draft, takes yours, and illustrates the piece on request', async () => {
      const run = await h.start(c3, { problem: { text: 'A newsletter piece on teaching fractions with recipes' }, inputs: { draft: AUTHOR_DRAFT } });
      const view = await h.drive(run.id, (cp) => (cp.kind === 'choose' ? { checkpointId: cp.id, choice: ['own'] } : undefined));
      expect(view.run.status).toBe('done');
      checkEvents(view, 'c3');
      const choose = view.checkpoints.find((c) => c.kind === 'choose')!;
      // The route's plain question and labels (UX-3, @byway/catalog routeChoice); the ids stay the branch names.
      expect(choose).toMatchObject({ stepId: 'draft', prompt: 'Who writes the first draft?' });
      expect(choose.options?.map((o) => o.label)).toEqual(['The AI drafts it: from your point, for you to revise and rewrite', 'You write it: the whole first draft, yourself']);
      expect(choose.options?.map((o) => o.id)).toEqual(['ai', 'own']);
      // The sweep's tells: every catalog its domains name, joined in order (tellsPromptIds), not just the medium's.
      const tells = h.prompts.calls.filter((c) => c.id === 'product.c3.tells-sweep').at(-1)!.slots.tells!;
      expect([...tells.matchAll(/\((tells\.[a-z-]+)\)/g)].map((m) => m[1])).toEqual(['tells.prose-words', 'tells.prose-structure', 'tells.newsletter', 'tells.social']);
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
