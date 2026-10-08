/**
 * C2 Idea Generator (options) and C5 Ad Video Chain (media) end to end: dedupe, an audit with the vanilla-overlap
 * lens, a person's vision loop and mood boards; then storyboards, anchor frames, the relay chain on the demo video
 * model (and with no video model: honest skips), the launch gate's retry and the person's call.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { c2, c5 } from '@byway/catalog';
import type { VideoRequest, VideoResult } from '@byway/contracts';
import { NO_AUDIO_NOTE } from '../src/activities/asset.ts';
import { OK_FALLBACK_NOTE } from '../src/activities/critic.ts';
import { NO_COMPOSITING_NOTE, NO_VIDEO_NOTE } from '../src/activities/relay.ts';
import { GATE_FAILED_PROMPT, GATE_RETRY_NOTE, READY_PROMPT } from '../src/workflow/wording.ts';
import { checkEvents, notes, ofType } from './helpers/events.ts';
import { png } from './helpers/fake-pages.ts';
import { createHarness, NO_VIDEO_PROFILE, type Harness } from './helpers/harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 120_000);
afterAll(async () => {
  await h?.close();
}, 60_000);

const json = async (id: string) => JSON.parse(await h.store.artifacts.getText(id)) as Record<string, unknown>;

describe('C2 on options', () => {
  it('runs end to end: twelve sparks, dedupe, annotations, your vision rounds, your words, mood boards beside the work', async () => {
    let readyAsked = 0;
    const run = await h.start(c2, { problem: { text: 'Positioning options for a bike repair subscription' } });
    const view = await h.drive(run.id, (cp) => {
      if (cp.prompt === READY_PROMPT) return { checkpointId: cp.id, approved: ++readyAsked > 1 };
      if (cp.kind === 'write') return { checkpointId: cp.id, text: cp.initialText!.replace(/^Title: .*$/m, 'Title: Fix-it Fridays') };
      return undefined;
    });
    expect(view.run.status).toBe('done');
    checkEvents(view, 'c2');
    const purposes = h.succeeded(run.id).map((c) => c.purpose);
    expect(purposes.filter((p) => p === 'seed:options')).toHaveLength(12);
    expect(purposes.filter((p) => p === 'dedupe:options')).toHaveLength(1);

    // Dedupe folds near-duplicates: the pool the person sees has fewer than twelve.
    const pool = ofType(view, 'step-finished', 'pool-render')[0]!.data.outputArtifactIds as string[];
    expect(pool.length).toBe(9);

    // The vanilla-overlap lens: unseeded answers as V1–V3 in the options slot, the seeded pool as A, B, C… in the view.
    const flag = h.prompts.calls.filter((c) => c.id === 'product.c2.vanilla-flag').at(-1)!;
    expect(flag.slots.options).toMatch(/^### V1\n[\s\S]*### V3\n/);
    expect(flag.slots.view).toContain('### I\n');
    // Three unseeded answers, and the option map.
    expect(purposes.filter((p) => p === 'build:options')).toHaveLength(4);
    // The critic lens ranks against prior art only with references; here it scored, and said so.
    expect(notes(view, 'critic')).toEqual([OK_FALLBACK_NOTE]);

    // The annotations reach the option map, joined under their lens names, and never the options themselves.
    const map = h.prompts.calls.filter((c) => c.id === 'product.c2.option-map').at(-1)!;
    expect(map.slots.critique).toMatch(/^## vanilla-overlap\n[\s\S]*## critic\n/);
    expect(map.slots.options).toContain('### I');

    // Two vision rounds: you reacted twice, and said it was ready the second time.
    expect(ofType(view, 'loop-iteration', 'vision').map((e) => e.data.iteration)).toEqual([1, 2]);
    expect(view.checkpoints.filter((c) => c.stepId === 'react')).toHaveLength(2);
    const react = view.checkpoints.find((c) => c.stepId === 'react')!;
    expect(react.artifactIds?.length).toBeGreaterThanOrEqual(9);
    // Beside the pool, the audit's notes: the overlap flags and the critique.
    const types = await Promise.all(react.artifactIds!.map(async (id) => (await h.store.artifacts.get(id)).record.mediaType));
    expect(types.filter((t) => t === 'text/markdown')).toHaveLength(2);

    // Your words land in the option map; the mood boards are kept beside it.
    const out = (await json(view.run.outputArtifactId!)) as { options: { title: string; imageArtifactId?: string }[] };
    expect(out.options[0]!.title).toBe('Fix-it Fridays');
    expect(out.options.every((o) => o.imageArtifactId === undefined)).toBe(true);
    const moods = h.succeeded(run.id).filter((c) => c.purpose === 'asset:options');
    expect(moods).toHaveLength(out.options.length);
    const beside = ofType(view, 'step-finished', 'mood-boards')[0]!.data.outputArtifactIds as string[];
    const annotated = (await json(beside.at(-1)!)) as { options: { imageArtifactId?: string }[] };
    expect(annotated.options.every((o) => o.imageArtifactId?.startsWith('sha256:'))).toBe(true);
    const briefs = h.prompts.calls.filter((c) => c.id === 'product.c2.mood-boards').at(-1)!;
    expect(briefs.slots.options).toMatch(/^### A\nFix-it Fridays: /);
  }, 120_000);
});

describe('C5 on media', () => {
  it('runs the relay one shot after another from the anchor frames, holds your script, and retries D2 when the launch gate fails', async () => {
    h.responders['critic:media'] = () => '- The payoff shot is too short.\nScore: 5/10';
    const script = 'Less time on the road.\nMore time on the trail.';
    try {
      const run = await h.start(c5, { problem: { text: 'A 30-second video ad for trail running shoes' } });
      const view = await h.drive(run.id, (cp) => (cp.stepId === 'vo-script' ? { checkpointId: cp.id, text: script } : undefined));
      expect(view.run.status).toBe('done');
      checkEvents(view, 'c5');
      const purposes = h.succeeded(run.id).map((c) => c.purpose);
      expect(purposes.filter((p) => p === 'seed:media')).toHaveLength(8);
      expect(purposes).toContain('dedupe:media');
      expect(purposes).toContain('overlap:media');
      expect(purposes.filter((p) => p === 'build:media')).toHaveLength(3 + 3); // three unseeded answers, three concepts

      // The gate failed, D2 ran again once (same brief), the gate failed again, and you decided.
      expect(ofType(view, 'step-started', 'anchor-frames')).toHaveLength(2);
      expect(notes(view, 'launch-gate')).toEqual([GATE_RETRY_NOTE]);
      expect(view.checkpoints.filter((c) => c.prompt === GATE_FAILED_PROMPT)).toHaveLength(1);

      // Each D2 pass: four relay links (maxLinks) from five shots, then the render-in-scene link, all on one chain.
      const videos = h.succeeded(run.id).filter((c) => c.kind === 'video');
      expect(videos).toHaveLength(2 * 5);
      for (const pass of [videos.slice(0, 5), videos.slice(5)]) {
        const reqs = pass.map((v) => v.request as VideoRequest);
        const results = pass.map((v) => v.result as VideoResult);
        expect(reqs.map((r) => r.purpose)).toEqual(Array(5).fill('relay:media'));
        expect(reqs.slice(0, 4).map((r) => /^Shot (\d+)/.exec(r.prompt)?.[1])).toEqual(['1', '2', '3', '4']);
        for (let i = 1; i < 5; i++) expect(reqs[i]!.startFrameArtifactId).toBe(results[i - 1]!.lastFrameArtifactId);
      }
      // The first link starts from shot 1's anchor frame.
      const anchorRun = ofType(view, 'step-finished', 'anchor-frames')[0]!.data.outputArtifactIds as string[];
      const framed = (await json(anchorRun.at(-1)!)) as { storyboard: { shot: number; imageArtifactId?: string }[] };
      expect((videos[0]!.request as VideoRequest).startFrameArtifactId).toBe(framed.storyboard.find((s) => s.shot === 1)!.imageArtifactId);

      // Honest skips for the steps v1 cannot do.
      expect(notes(view, 'matte')).toEqual([NO_COMPOSITING_NOTE, NO_COMPOSITING_NOTE]);
      expect(notes(view, 'vo-audio')).toEqual([NO_AUDIO_NOTE, NO_AUDIO_NOTE]);
      expect(ofType(view, 'step-finished', 'matte').every((e) => e.data.skipped === true)).toBe(true);

      // The storyboard carries each shot's frame and the clips; your script survived every machine write.
      const sb = (await json(view.run.outputArtifactId!)) as { storyboard: { shot: number; imageArtifactId?: string; clipArtifactId?: string }[]; voiceover: string };
      expect(sb.voiceover).toBe(script);
      expect(sb.storyboard.every((s) => s.imageArtifactId)).toBe(true);
      expect(sb.storyboard.filter((s) => s.clipArtifactId).map((s) => s.shot)).toEqual([1, 2, 3, 4, 5]);
      // Clip and frame artifacts are announced with their shot.
      expect(ofType(view, 'artifact').filter((e) => /^Clip for shot/.test(e.data.label as string)).map((e) => e.data.shot)).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
      // The relay prompt gets the storyboard, "Shot N", and the anchor frame attached.
      const clipPrompt = h.prompts.calls.find((c) => c.id === 'product.c5.clip')!;
      expect(clipPrompt.slots.brief).toBe('Shot 1');
      expect(JSON.parse(clipPrompt.slots.artifact!)).toHaveProperty('storyboard');
    } finally {
      delete h.responders['critic:media'];
    }
  }, 180_000);

  it('with no video model, every relay link finishes skipped and says so; the storyboard and anchor pass through', async () => {
    // GREAT mode (three references): ours second in the lineup, which meets the hidden rank.
    h.responders['critic:media'] = (ctx) => `- Fine.\nRank: 2 of ${/\((\d+) items/.exec(ctx.prompt)?.[1] ?? '?'}`;
    try {
      const refs = [png(4, 3, [10, 20, 30]), png(4, 3, [40, 50, 60]), png(4, 3, [70, 80, 90])];
      const refIds: string[] = [];
      for (const r of refs) refIds.push((await h.store.artifacts.put(r, 'image/png')).id);
      const run = await h.start(c5, { profileId: NO_VIDEO_PROFILE.id, problem: { text: 'A 15-second ad for a reusable coffee cup' }, inputs: { refs: refIds } });
      const view = await h.drive(run.id);
      expect(view.run.error).toBeUndefined();
      expect(view.run.status).toBe('done');
      checkEvents(view, 'c5');
      expect(h.succeeded(run.id).filter((c) => c.kind === 'video')).toEqual([]);
      for (const stepId of ['clip', 'render-in-scene']) {
        const fin = ofType(view, 'step-finished', stepId);
        expect(fin.length).toBeGreaterThan(0);
        expect(fin.every((e) => e.data.skipped === true && e.data.note === NO_VIDEO_NOTE)).toBe(true);
      }
      expect(ofType(view, 'step-finished', 'clip')).toHaveLength(4);
      const sb = (await json(view.run.outputArtifactId!)) as { storyboard: { imageArtifactId?: string; clipArtifactId?: string }[] };
      expect(sb.storyboard.every((s) => s.imageArtifactId && !s.clipArtifactId)).toBe(true);
      // With three references the gate's critic ranks in GREAT mode: two fixed shuffles, averaged.
      const gate = h.succeeded(run.id).filter((c) => c.stepId === 'gate-critic');
      expect(gate).toHaveLength(2);
      expect(view.checkpoints.some((c) => c.prompt === GATE_FAILED_PROMPT)).toBe(false);
      expect(notes(view, 'gate-critic')).toEqual([undefined]);
    } finally {
      delete h.responders['critic:media'];
    }
  }, 180_000);
});
