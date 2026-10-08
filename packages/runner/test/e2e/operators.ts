/**
 * Operators on small recipes: a relay link checked and regenerated until clean (each regeneration starts from the
 * link's own start frame), a loop whose cap is settled by policy (a fresh re-rank), and the run's intake on its record.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { VideoRequest, VideoResult } from '@byway/contracts';
import { checkEvents, ofType } from '../helpers/events.ts';
import type { Harness } from '../helpers/harness.ts';
import { judgedPick, policyLoop, randomPick, scripted, shortAd, tiny } from '../helpers/recipes.ts';

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

  describe('the run record', () => {
    it('records the intake a run started from', async () => {
      const intake = await h.store.createIntake({ id: 'intake-1', workspaceId: h.workspaceId, problem: { text: 'A memo' } });
      const run = await h.start(tiny, { intakeId: intake.id });
      expect(run.intakeId).toBe(intake.id);
      expect((await h.drive(run.id)).run.intakeId).toBe(intake.id);
    }, 60_000);
  });
}
