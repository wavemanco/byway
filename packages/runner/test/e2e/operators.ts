/**
 * Operators on small recipes: a relay link checked and regenerated until clean (each regeneration starts from the
 * link's own start frame), demo-mode media, an empty CUT directive, picks by a judge and by chance, a loop whose cap
 * is settled by policy (a fresh re-rank), keepsVoice, and the run's intake on its record.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { VideoRequest, VideoResult } from '@byway/contracts';
import { NOTHING_TO_REMOVE } from '../../src/workflow/wording.ts';
import { checkEvents, ofType } from '../helpers/events.ts';
import { NO_VIDEO_PROFILE, type Harness } from '../helpers/harness.ts';
import { claimLogged, illustrated, judgedPick, policyLoop, randomPick, scripted, shortAd, tiny, trimmed, trimmedByHand, twiceJudged, voicedPage } from '../helpers/recipes.ts';
import { pageCopy } from '../../src/copy.ts';

let h: Harness;

/** Registers these scenarios on the test file's shared harness (one Temporal server and worker per file). */
export function operatorScenarios(use: () => Harness): void {
  beforeAll(() => {
    h = use();
  });

  describe('relay with a check-clean repair loop', () => {
    it('regenerates a link that has a defect, from the same start frame, until the check is clean; links run in order', async () => {
      let checks = 0;
      h.responders['check:media'] = () => (++checks === 1 ? '- Garbled lettering on the cup in shot 1.' : 'No defects.');
      try {
        const run = await h.start(shortAd, { problem: { text: 'A 10-second ad for a reusable cup' } });
        const view = await h.drive(run.id);
        expect(view.run.status).toBe('done');
        checkEvents(view);
        expect(ofType(view, 'step-started', 'clip')).toHaveLength(2);
        expect(ofType(view, 'step-started', 'regenerate')).toHaveLength(1);
        expect(ofType(view, 'loop-iteration', 'repair').map((e) => e.data.iteration)).toEqual([1, 2, 1]);
        // The regeneration was told the defect.
        expect(h.prompts.calls.find((c) => c.id === 'product.test.regenerate')?.slots.critique).toBe('- Garbled lettering on the cup in shot 1.');
        const videos = h.succeeded(run.id).filter((c) => c.kind === 'video');
        const [clip1, regen1, clip2] = videos.map((v) => ({ req: v.request as VideoRequest, res: v.result as VideoResult }));
        expect(videos).toHaveLength(3);
        // The regeneration redoes link 1 from its start frame (shot 1's frame), not from the defective clip's end…
        expect(regen1!.req.startFrameArtifactId).toBe(clip1!.req.startFrameArtifactId);
        expect(regen1!.req.startFrameArtifactId).not.toBe(clip1!.res.lastFrameArtifactId);
        // …and link 2 starts from the regenerated clip's last frame.
        expect(clip2!.req.startFrameArtifactId).toBe(regen1!.res.lastFrameArtifactId);
        expect(clip2!.req.prompt).toMatch(/^Shot 2: /);
        const sb = JSON.parse(await h.store.artifacts.getText(view.run.outputArtifactId!)) as { storyboard: { shot: number; clipArtifactId?: string }[] };
        expect(sb.storyboard.find((s) => s.shot === 1)?.clipArtifactId).toBe(regen1!.res.artifactId);
        expect(sb.storyboard.find((s) => s.shot === 2)?.clipArtifactId).toBe(clip2!.res.artifactId);
      } finally {
        delete h.responders['check:media'];
      }
    }, 60_000);
  });

  describe('demo mode decides media by the demo profile (contracts v4 Gateway.demo)', () => {
    it('a run on a profile without a video model still gets the demo clips, because every call goes to the mock', async () => {
      const run = await h.start(shortAd, { profileId: NO_VIDEO_PROFILE.id, problem: { text: 'A 10-second ad for a reusable cup' } });
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('done');
      const videos = h.succeeded(run.id).filter((c) => c.kind === 'video');
      expect(videos.map((v) => (v.request as VideoRequest).shot)).toEqual([1, 2]);
      expect(ofType(view, 'step-finished', 'clip').every((e) => e.data.skipped === undefined)).toBe(true);
    }, 60_000);
  });

  describe('an empty CUT directive (spec §3.3 "Nothing to remove.")', () => {
    it('a model that finds nothing to remove ends the trim there: the fix makes no change and says so', async () => {
      h.responders['cut:prose'] = () => 'Nothing to remove.';
      try {
        const run = await h.start(trimmed, { problem: { text: 'A memo on the billing migration' } });
        const view = await h.drive(run.id);
        expect(view.run.status).toBe('done');
        checkEvents(view);
        const draft = ofType(view, 'artifact', 'draft')[0]!.data.artifactId;
        expect(view.run.outputArtifactId).toBe(draft);
        expect(h.succeeded(run.id).map((c) => c.purpose)).toEqual(['build:prose', 'cut:prose']);
        const trim = ofType(view, 'step-finished', 'trim')[0]!;
        expect(await h.store.artifacts.getText((trim.data.outputArtifactIds as string[])[0]!)).toBe('Nothing to remove.\n');
        expect(ofType(view, 'step-started', 'apply-cut')).toHaveLength(1);
        expect(ofType(view, 'step-finished', 'apply-cut').map((e) => e.data)).toEqual([{ costUsd: 0, note: NOTHING_TO_REMOVE }]);
      } finally {
        delete h.responders['cut:prose'];
      }
    }, 60_000);

    it('a model’s removals are applied as usual', async () => {
      const run = await h.start(trimmed, { problem: { text: 'A memo on the billing migration' } });
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('done');
      expect(h.succeeded(run.id).map((c) => c.purpose)).toEqual(['build:prose', 'cut:prose', 'fix:prose']);
      expect(h.prompts.calls.filter((c) => c.id === 'product.test.apply-cut').at(-1)!.slots.critique).toMatch(/^- (Remove|Delete|Drop|Merge) /);
      expect(ofType(view, 'step-finished', 'apply-cut')[0]!.data.note).toBeUndefined();
    }, 60_000);

    it('a person who lists nothing to remove gets the same: no change, and a note', async () => {
      const run = await h.start(trimmedByHand, { problem: { text: 'A memo on the billing migration' } });
      const view = await h.drive(run.id, (cp) => (cp.kind === 'directive' ? { checkpointId: cp.id, text: '  \n' } : undefined));
      expect(view.run.status).toBe('done');
      expect(h.succeeded(run.id).map((c) => c.purpose)).toEqual(['build:prose']);
      expect(ofType(view, 'step-finished', 'apply-cut')[0]!.data.note).toBe(NOTHING_TO_REMOVE);
      expect(view.run.outputArtifactId).toBe(ofType(view, 'artifact', 'draft')[0]!.data.artifactId);
    }, 60_000);
  });

  describe('picks by a judge and by chance', () => {
    it('pick(C) asks the judge step to choose among the labelled candidates', async () => {
      h.responders['judge:prose'] = () => 'B is clearest.\nChoice: B';
      try {
        const run = await h.start(judgedPick);
        const view = await h.drive(run.id);
        expect(view.run.status).toBe('done');
        const drafts = ofType(view, 'artifact', 'draft').sort((a, b) => (a.candidate ?? 0) - (b.candidate ?? 0));
        expect(drafts.map((e) => e.candidate)).toEqual([0, 1, 2]);
        expect(view.run.outputArtifactId).toBe(drafts[1]!.data.artifactId);
        const judge = h.prompts.calls.filter((c) => c.id === 'product.test.judge').at(-1)!;
        expect(judge.slots.options).toMatch(/^### A\n[\s\S]*### B\n[\s\S]*### C\n/);
        expect(view.checkpoints).toEqual([]);
      } finally {
        delete h.responders['judge:prose'];
      }
    }, 60_000);

    it('pick(R) keeps one at random, deterministically on replay, and asks no one', async () => {
      const run = await h.start(randomPick);
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('done');
      const drafts = ofType(view, 'artifact', 'draft').map((e) => e.data.artifactId);
      expect(drafts).toContain(view.run.outputArtifactId);
      expect(ofType(view, 'step-finished', 'choose')[0]!.data.outputArtifactIds).toEqual([view.run.outputArtifactId]);
    }, 60_000);
  });

  describe('a loop capped by policy', () => {
    it('takes the best snapshot by a fresh re-rank, asking no one', async () => {
      const scores = [7, 8, 7.5];
      // One candidate, so the demo's count of this step's critic calls is the round (the prompt never says).
      h.responders['critic:prose'] = (ctx) => `- The ask is buried.\nScore: ${scores[ctx.iteration]}/10`;
      h.responders['rerank:prose'] = () => 'A holds together best.\nChoice: A';
      // Distinct revisions each round, so the three snapshots are three versions.
      h.responders['fix:prose'] = (ctx) => `\`\`\`markdown\n# Billing migration\n\nRevision ${/Round: (\d+)/.exec(ctx.prompt)?.[1]}: the ask comes first.\n\`\`\``;
      try {
        const run = await h.start(policyLoop, { problem: { text: 'A memo on the billing migration' } });
        const view = await h.drive(run.id);
        expect(view.run.status).toBe('done');
        checkEvents(view);
        expect(view.checkpoints).toEqual([]);
        expect(ofType(view, 'loop-iteration', 'polish').map((e) => e.data.score)).toEqual([7, 8, 7.5]);
        // Re-ranked in a fresh call that saw the versions, best first (A = the one scored 8), with no scores attached.
        const rerank = h.succeeded(run.id).filter((c) => c.purpose === 'rerank:prose');
        expect(rerank).toHaveLength(1);
        expect(JSON.stringify(rerank[0]!.request)).not.toMatch(/Score|buried/);
        const revisions = ofType(view, 'artifact', 'revise').map((e) => e.data.artifactId);
        // Round 2 scored the first revision; it is the deliverable.
        expect(view.run.outputArtifactId).toBe(revisions[0]);
      } finally {
        delete h.responders['critic:prose'];
        delete h.responders['rerank:prose'];
        delete h.responders['fix:prose'];
      }
    }, 60_000);
  });

  describe('keepsVoice (port rule 6)', () => {
    it('refuses a machine write that changes the words you wrote, and keeps the one that does not', async () => {
      const script = 'Less time on the road.\nMore time on the trail.';
      let n = 0;
      h.responders['fix:media'] = (ctx) => {
        const board = JSON.parse([...ctx.prompt.matchAll(/```json\n([\s\S]*?)\n```/g)].at(-1)![1]!) as { voiceover: string };
        if (++n === 1) board.voiceover = 'Run further, faster, freer.';
        return '```json\n' + JSON.stringify(board) + '\n```';
      };
      try {
        const run = await h.start(scripted, { problem: { text: 'A 10-second ad for trail shoes' } });
        const view = await h.drive(run.id, (cp) => (cp.kind === 'write' ? { checkpointId: cp.id, text: script } : undefined));
        expect(view.run.status).toBe('done');
        const fixes = h.succeeded(run.id).filter((c) => c.purpose === 'fix:media');
        expect(fixes).toHaveLength(2);
        expect(JSON.stringify(fixes[1]!.request)).toMatch(/own words must stay exactly as written/);
        const out = JSON.parse(await h.store.artifacts.getText(view.run.outputArtifactId!)) as { voiceover: string };
        expect(out.voiceover).toBe(script);
      } finally {
        delete h.responders['fix:media'];
      }
    }, 60_000);
  });

  describe('a paid call is not bought twice (ENG-3, ENG-12, convention C5)', () => {
    it('a step whose local write failed after its model call is retried by Temporal and reuses the answer it bought', async () => {
      const original = h.store.artifacts.putText.bind(h.store.artifacts);
      let runId = '';
      let failed = false;
      h.store.artifacts.putText = async (text, mediaType) => {
        // The draft's own write fails once, after the model answered and the call was ledgered.
        if (!failed && mediaType === 'text/markdown' && runId && h.succeeded(runId).some((c) => c.purpose === 'build:prose')) {
          failed = true;
          throw new Error('The disk is full.');
        }
        return original(text, mediaType);
      };
      try {
        const run = await h.start(tiny);
        runId = run.id;
        const view = await h.drive(run.id);
        expect(view.run.status).toBe('done');
        expect(failed).toBe(true);
        expect(h.succeeded(run.id).filter((c) => c.stepId === 'draft')).toHaveLength(1);
        expect(h.ledger(run.id).filter((e) => e.stepId === 'draft')).toHaveLength(1);
        expect(ofType(view, 'step-started', 'draft')).toHaveLength(1);
        expect(ofType(view, 'step-failed')).toEqual([]);
      } finally {
        h.store.artifacts.putText = original;
      }
    }, 60_000);

    it('a step run again after a budget raise reuses its briefs and images, and the timeline shows the images it placed', async () => {
      h.refuseOnce((c) => c.purpose === 'asset.integrate:prose');
      const run = await h.start(illustrated, { problem: { text: 'A status memo on the billing migration' } });
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('done');
      expect(view.checkpoints.some((c) => c.kind === 'confirm' && c.stepId === 'art' && /^Raise the budget by \$1\?/.test(c.prompt))).toBe(true);
      const paid = h.succeeded(run.id).filter((c) => c.stepId === 'art');
      expect(paid.filter((c) => c.purpose === 'asset.briefs:prose')).toHaveLength(1);
      const images = paid.filter((c) => c.kind === 'image');
      expect(images.length).toBeGreaterThan(0);
      expect(new Set(images.map((c) => JSON.stringify(c.request))).size).toBe(images.length);
      expect(paid.filter((c) => c.purpose === 'asset.integrate:prose')).toHaveLength(1);
      // The images the timeline shows are the ones placed in the work.
      const shown = ofType(view, 'artifact', 'art').filter((e) => (e.data.mediaType as string).startsWith('image/')).map((e) => e.data.artifactId as string);
      const out = await h.store.artifacts.getText(view.run.outputArtifactId!);
      expect(shown.length).toBe(images.length);
      for (const id of shown) expect(out).toContain(`/api/artifacts/${id}`);
    }, 60_000);

    it('a GREAT critic refused on its second shuffle reuses the first after the raise: the same lineup, not bought again', async () => {
      let critics = 0;
      h.refuseOnce((c) => c.purpose === 'critic:prose' && ++critics === 2);
      const refs: string[] = [];
      for (const t of ['# One\n\nClear ask.', '# Two\n\nOne point.', '# Three\n\nShort.']) refs.push((await h.store.artifacts.putText(t, 'text/markdown')).id);
      const run = await h.start(twiceJudged, { problem: { text: 'A memo on the billing migration' }, inputs: { refs } });
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('done');
      expect(h.succeeded(run.id).filter((c) => c.purpose === 'critic:prose')).toHaveLength(2);
      expect(ofType(view, 'step-finished', 'critic')).toHaveLength(1);
    }, 60_000);
  });

  describe('an answer that cannot be written back is asked for again, never a failed run (ENG-6)', () => {
    it('your words on a page with a line added: asked again with your text and why, at no cost; the fixed answer is placed', async () => {
      const asks: { prompt: string; initialText?: string }[] = [];
      let offered: string[] = [];
      const run = await h.start(voicedPage, { problem: { text: 'A landing page for a bike repair shop' } });
      const view = await h.drive(run.id, (cp) => {
        if (cp.kind !== 'write') return undefined;
        asks.push({ prompt: cp.prompt, ...(cp.initialText !== undefined ? { initialText: cp.initialText } : {}) });
        if (asks.length === 1) {
          offered = cp.initialText!.split('\n');
          return { checkpointId: cp.id, text: [...offered, 'A line of my own, with no block to go in.'].join('\n') };
        }
        return { checkpointId: cp.id, text: offered.map((l, i) => (i === 1 ? 'Fixed by Friday, or the next one is free' : l)).join('\n') };
      });
      expect(view.run.status).toBe('done');
      checkEvents(view);
      expect(asks).toHaveLength(2);
      // The second ask says what went wrong and starts from what you wrote, not from the page's copy.
      expect(asks[1]!.prompt).toMatch(new RegExp(`one line per block of text: ${offered.length} lines`));
      expect(asks[1]!.initialText).toContain('A line of my own');
      // A line count that cannot be placed is refused before any model call; the fixed answer is placed.
      expect(h.succeeded(run.id).filter((c) => c.purpose === 'voice.apply:web-page')).toHaveLength(1);
      expect(pageCopy(await h.store.artifacts.getText(view.run.outputArtifactId!))).toContain('Fixed by Friday, or the next one is free');
      expect(ofType(view, 'step-failed')).toEqual([]);
    }, 60_000);

    it('a claim log answered with an extra line is asked again; the corrected claim then replaces its sentence', async () => {
      let n = 0;
      let offered: string[] = [];
      const run = await h.start(claimLogged, { problem: { text: 'A status memo on the billing migration' } });
      const view = await h.drive(run.id, (cp) => {
        if (cp.kind !== 'write') return undefined;
        if (++n === 1) {
          offered = cp.initialText!.split('\n');
          return { checkpointId: cp.id, text: `${cp.initialText}\n- And one more claim: 3 teams.` };
        }
        return { checkpointId: cp.id, text: [...offered.slice(0, -1), '- Decide on the 31st, once the numbers are in.'].join('\n') };
      });
      expect(view.run.status).toBe('done');
      expect(n).toBe(2);
      expect(view.checkpoints.filter((c) => c.stepId === 'claims')[1]!.prompt).toMatch(/one line per claim/);
      const out = await h.store.artifacts.getText(view.run.outputArtifactId!);
      expect(out).toContain('Decide on the 31st, once the numbers are in.');
      expect(out.replace(/\s+/g, ' ')).not.toContain(offered.at(-1)!.replace(/^- /, ''));
    }, 60_000);
  });

  describe('the run record', () => {
    it('records the intake a run started from', async () => {
      const intake = await h.store.createIntake({ id: 'intake-1', workspaceId: h.workspaceId, problem: { text: 'A memo' } });
      const run = await h.start(tiny, { intakeId: intake.id });
      expect(run.intakeId).toBe(intake.id);
      expect((await h.drive(run.id)).run.intakeId).toBe(intake.id);
    }, 60_000);
  });
}
