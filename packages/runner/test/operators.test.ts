/**
 * Operators on small recipes: a relay link checked and regenerated until clean (each regeneration starts from the
 * link's own start frame), a loop whose cap is settled by policy (a fresh re-rank), and the run's intake on its record.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { VideoRequest, VideoResult } from '@byway/contracts';
import { checkEvents, ofType } from './helpers/events.ts';
import { createHarness, type Harness } from './helpers/harness.ts';
import { policyLoop, shortAd, tiny } from './helpers/recipes.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 120_000);
afterAll(async () => {
  await h?.close();
}, 60_000);

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

describe('a loop capped by policy', () => {
  it('takes the best snapshot by a fresh re-rank, asking no one', async () => {
    const scores = [7, 8, 7.5];
    h.responders['critic:prose'] = (ctx) => `- The ask is buried.\nScore: ${scores[Number(/Round: (\d+)/.exec(ctx.prompt)?.[1] ?? 1) - 1]}/10`;
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

describe('the run record', () => {
  it('records the intake a run started from', async () => {
    const intake = await h.store.createIntake({ id: 'intake-1', workspaceId: h.workspaceId, problem: { text: 'A memo' } });
    const run = await h.start(tiny, { intakeId: intake.id });
    expect(run.intakeId).toBe(intake.id);
    expect((await h.drive(run.id)).run.intakeId).toBe(intake.id);
  }, 60_000);
});
