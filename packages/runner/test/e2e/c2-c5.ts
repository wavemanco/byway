/**
 * C2 Idea Generator (options) and C5 Ad Video Chain (media) end to end: dedupe, an audit with the vanilla-overlap
 * lens, a person's vision loop and mood boards; then storyboards, anchor frames, the relay chain on the demo video
 * model (and with no video model: honest skips), the launch gate's retry and the person's call.
 */
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { c2, c5 } from '@byway/catalog';
import type { CompletionRequest, VideoRequest, VideoResult } from '@byway/contracts';
import { problemSlot } from '@byway/prompts/pure';
import { NO_AUDIO_NOTE } from '../../src/activities/asset.ts';
import { OK_FALLBACK_NOTE } from '../../src/activities/critic.ts';
import { NO_COMPOSITING_NOTE, NO_VIDEO_NOTE } from '../../src/activities/relay.ts';
import { BEST_SO_FAR_PROMPT, GATE_FAILED_PROMPT, GATE_RETRY_NOTE, READY_PROMPT } from '../../src/workflow/wording.ts';
import { noClipNote } from '../../src/activities/render.ts';
import { maximalBrief } from '../helpers/briefs.ts';
import { checkEvents, notes, ofType } from '../helpers/events.ts';
import { fakeShots, png } from '../helpers/fake-pages.ts';
import { NO_VIDEO_PROFILE, type Harness } from '../helpers/harness.ts';

let h: Harness;

const json = async (id: string) => JSON.parse(await h.store.artifacts.getText(id)) as Record<string, unknown>;

/** Registers these scenarios on the test file's shared harness (one Temporal server and worker per file). */
export function c2c5Scenarios(use: () => Harness): void {
  beforeAll(() => {
    h = use();
  });

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
      // "Is this ready?" shows what it asks about: the options and the briefs the AI sharpened (ENG-8).
      const ready = view.checkpoints.find((c) => c.prompt === READY_PROMPT)!;
      const sharpened = (ofType(view, 'step-finished', 'sharpen')[0]!.data.outputArtifactIds as string[])[0]!;
      expect(ready.artifactIds).toContain(sharpened);
      expect(ready.artifactIds!.length).toBeGreaterThanOrEqual(10);
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
      // One board for each chosen option, as the option map flags them, and none for the rest (B-049): the demo's map
      // chooses the first two.
      const chosen = (out.options as { chosen?: boolean }[]).map((o) => o.chosen === true);
      expect(chosen.slice(0, 2)).toEqual([true, true]);
      const moods = h.succeeded(run.id).filter((c) => c.purpose === 'asset:options');
      expect(moods).toHaveLength(chosen.filter(Boolean).length);
      const beside = ofType(view, 'step-finished', 'mood-boards')[0]!.data.outputArtifactIds as string[];
      const annotated = (await json(beside.at(-1)!)) as { options: { imageArtifactId?: string }[] };
      expect(annotated.options.map((o) => o.imageArtifactId?.startsWith('sha256:') === true)).toEqual(chosen);
      const briefs = h.prompts.calls.filter((c) => c.id === 'product.c2.mood-boards').at(-1)!;
      expect(briefs.slots.options).toMatch(/^### A\nFix-it Fridays: /);
    }, 120_000);

    it('runs on the largest brief the web accepts, in Chinese, and every prompt that shows the brief carries all of it exactly (P2)', async () => {
      // About 3 MB of UTF-8: before P2 it rode in the start input and every step's input, past Temporal's 2 MB limit on
      // one value, and the run stayed "running" with nothing spent.
      const brief = maximalBrief();
      const from = h.prompts.calls.length;
      const run = await h.start(c2, { problem: brief });
      const view = await h.drive(run.id);
      expect(view.run.status).toBe('done');
      checkEvents(view, 'c2');
      expect(view.run.problem).toBe(brief.text);
      // Every step that takes the brief: the twelve seeds and the three unseeded answers of D1. Compared whole, not by
      // toEqual, so a mismatch does not print a million characters.
      const shown = h.prompts.calls.slice(from).filter((c) => c.slots.problem !== undefined);
      expect(shown.map((c) => c.id).sort()).toEqual([...Array<string>(12).fill('product.c2.seed-option'), ...Array<string>(3).fill('product.c2.vanilla-build')].sort());
      const exact = problemSlot(brief);
      expect(shown.filter((c) => c.slots.problem !== exact)).toHaveLength(0);
      expect(h.succeeded(run.id).filter((c) => c.purpose === 'seed:options')).toHaveLength(12);
    }, 180_000);
  });

  describe('C5 on media', () => {
    it('runs the relay one shot after another from the anchor frames, holds your script, and retries D2 when the launch gate fails', async () => {
      h.responders['critic:media'] = () => '- The payoff shot is too short.\nScore: 5/10';
      // A stand-in shot check that finds a defect in any image beyond the link's own three frames (its start, middle and
      // last): a flaw in another shot's still, which the check used to be shown and no regeneration of this shot could
      // remove (F10).
      h.responders['check:media'] = (ctx) => (ctx.images > 3 ? '- Garbled lettering on the box in one of the frames.' : 'No defects.');
      const script = 'Less time on the road.\nMore time on the trail.';
      // The second D2 pass's machine writes give the work another tagline (the demo writes the same copy on both passes),
      // so the second late VOICE can tell the field-by-field box from the whole-answer one (B-075).
      const tagline = 'Built for the long way home.';
      h.responders['fix:media'] = (ctx) => {
        const board = JSON.parse([...ctx.prompt.matchAll(/```json\n([\s\S]*?)\n```/g)].at(-1)![1]!) as { tagline?: string };
        if (ctx.iteration > 0) board.tagline = tagline;
        return '```json\n' + JSON.stringify(board) + '\n```';
      };
      try {
        const headline = 'Less road. More trail.';
        let lateAsked = 0;
        const run = await h.start(c5, { problem: { text: 'A 30-second video ad for trail running shoes' } });
        const view = await h.drive(run.id, (cp) => {
          if (cp.stepId === 'vo-script') return { checkpointId: cp.id, text: script };
          // You write the headline at the first late VOICE, and send the second one back as it was offered.
          if (cp.stepId === 'voice') return { checkpointId: cp.id, text: ++lateAsked === 1 ? cp.initialText!.replace(/^Headline: .*$/m, `Headline: ${headline}`) : cp.initialText! };
          return undefined;
        });
        expect(view.run.status).toBe('done');
        checkEvents(view, 'c5');
        // The late VOICE offers the on-screen copy; the voice-over, locked after the script step, is not offered (VOICE-1).
        const late = view.checkpoints.filter((c) => c.stepId === 'voice');
        expect(late.length).toBeGreaterThan(0);
        for (const cp of late) {
          expect(cp.initialText).toMatch(/^Headline: .*\nTagline: .*\nShot 1: /);
          expect(cp.initialText).not.toContain('Less time on the road');
        }
        // VOICE-RETRY (D9): the gate's retry re-enters D2 from the ports it started with, which hold none of the copy you
        // wrote at the first late VOICE; the interpreter carries that answer across the retry, and the second late VOICE
        // starts from the line you wrote, which still fits the work (the same shots), with the work's lines for the fields
        // you left as offered (WORKFLOW-1). Sent back as offered, it is written: the work delivered carries your headline
        // (below), though you typed it once.
        expect(late).toHaveLength(2);
        expect(late[0]!.initialText).not.toContain(`Headline: ${headline}`);
        expect(late[1]!.initialText).toContain(`Headline: ${headline}`);
        // Only the line you wrote is carried: the tagline you left as offered is the work's new one, which the whole first
        // answer would have put back (VOICE-RETRY's box, field by field; the owner's "Only the lines you wrote", 2026-10-23).
        expect(late[0]!.initialText).not.toContain(`Tagline: ${tagline}`);
        expect(late[1]!.initialText).toContain(`Tagline: ${tagline}`);
        expect(late[1]!.prompt).toBe(late[0]!.prompt);
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
          // Each request names its shot (VideoRequest.shot): four links, then the render-in-scene on the last shot.
          expect(reqs.map((r) => r.shot)).toEqual([1, 2, 3, 4, 5]);
          for (let i = 1; i < 5; i++) expect(reqs[i]!.startFrameArtifactId).toBe(results[i - 1]!.lastFrameArtifactId);
        }
        // The first link starts from shot 1's anchor frame.
        const anchorRun = ofType(view, 'step-finished', 'anchor-frames')[0]!.data.outputArtifactIds as string[];
        const framed = (await json(anchorRun.at(-1)!)) as { storyboard: { shot: number; imageArtifactId?: string }[] };
        expect((videos[0]!.request as VideoRequest).startFrameArtifactId).toBe(framed.storyboard.find((s) => s.shot === 1)!.imageArtifactId);

        // Each shot check sees its link's three frames, the clip's start, a frame from its middle (F10 (a)) and its last
        // frame, and no other shot's still: no regeneration, no "best version so far?" question (F10).
        const checks = h.succeeded(run.id).filter((c) => c.stepId === 'shot-check');
        expect(checks).toHaveLength(2 * 4);
        const shown = (c: (typeof checks)[number]) => (c.request as CompletionRequest).messages.flatMap((m) => m.content.flatMap((p) => (p.type === 'image' ? [p.artifactId] : [])));
        for (const [i, c] of checks.slice(0, 4).entries()) {
          const start = (videos[i]!.request as VideoRequest).startFrameArtifactId;
          const made = videos[i]!.result as VideoResult;
          expect(made.middleFrameArtifactId).toBeDefined();
          expect(shown(c)).toEqual([start, made.middleFrameArtifactId, made.lastFrameArtifactId]);
        }
        expect(ofType(view, 'step-started', 'regenerate')).toEqual([]);
        expect(view.checkpoints.some((c) => c.prompt === BEST_SO_FAR_PROMPT)).toBe(false);

        // Honest skips for the steps v1 cannot do.
        expect(notes(view, 'matte')).toEqual([NO_COMPOSITING_NOTE, NO_COMPOSITING_NOTE]);
        expect(notes(view, 'vo-audio')).toEqual([NO_AUDIO_NOTE, NO_AUDIO_NOTE]);
        expect(ofType(view, 'step-finished', 'matte').every((e) => e.data.skipped === true)).toBe(true);

        // The storyboard carries each shot's frame and the clips; your script survived every machine write.
        const sb = (await json(view.run.outputArtifactId!)) as { storyboard: { shot: number; imageArtifactId?: string; clipArtifactId?: string }[]; voiceover: string; headline?: string; tagline?: string };
        expect(sb.voiceover).toBe(script);
        expect(sb.headline).toBe(headline);
        expect(sb.tagline).toBe(tagline);
        expect(sb.storyboard.every((s) => s.imageArtifactId)).toBe(true);
        expect(sb.storyboard.filter((s) => s.clipArtifactId).map((s) => s.shot)).toEqual([1, 2, 3, 4, 5]);
        // Clip and frame artifacts are announced with their shot.
        expect(ofType(view, 'artifact').filter((e) => /^Clip for shot/.test(e.data.label as string)).map((e) => e.data.shot)).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
        // Under the types the gateway stored: the demo's SVG placeholder clips, and their frames.
        expect(new Set(ofType(view, 'artifact').filter((e) => /^Clip for shot/.test(e.data.label as string)).map((e) => e.data.mediaType))).toEqual(new Set(['image/svg+xml']));
        const frames = ofType(view, 'artifact').filter((e) => /^Last frame of shot/.test(e.data.label as string));
        expect(frames.map((e) => e.data.mediaType)).toEqual(videos.map((v) => (v.result as VideoResult).lastFrameMediaType));
        // The relay prompt gets the storyboard, "Shot N", and the anchor frame attached.
        const clipPrompt = h.prompts.calls.find((c) => c.id === 'product.c5.clip')!;
        expect(clipPrompt.slots.brief).toBe('Shot 1');
        expect(JSON.parse(clipPrompt.slots.artifact!)).toHaveProperty('storyboard');
      } finally {
        delete h.responders['critic:media'];
        delete h.responders['check:media'];
        delete h.responders['fix:media'];
      }
    }, 180_000);

    it('with keys but no video model, every relay link finishes skipped and says so; the storyboard and anchor pass through', async () => {
      // GREAT mode (three references). The critic is blind (ADR-0072): every item is shown the same way, as one card
      // image (BLIND-1). This test's critic finds ours as only a test can, by the card drawn from none of the
      // references, and ranks it second of four: at or above the gate's middle-of-five bar scaled to four (rank 2; GATE-1).
      const refIds: string[] = [];
      const cardId = (html: string) => `sha256:${createHash('sha256').update(fakeShots(html, 'desktop').tiles[0]!).digest('hex')}`;
      h.responders['critic:media'] = (ctx) => {
        const m = Number(/\((\d+) items, labelled/.exec(ctx.prompt)?.[1] ?? 0);
        const all = Array.from({ length: m }, (_, i) => String.fromCharCode(65 + i));
        const ourCards = new Set(h.pages.rendered.filter((html) => html.includes('class="card"') && !refIds.some((r) => html.includes(encodeURIComponent(r)))).map(cardId));
        const ours = ctx.attachments?.find((a) => a.label && ourCards.has(a.artifactId))?.label ?? 'A';
        const others = all.filter((l) => l !== ours);
        return `### ${ours}\n- Intent: one feeling, landed.\n- The payoff shot is short.\n\nRanking: ${[others[0], ours, ...others.slice(1)].join(', ')}`;
      };
      // Keys are present (a placeholder; every profile here is backed by the mock), so the run's own profile decides.
      h.useKeys(true);
      try {
        const refs = [png(4, 3, [10, 20, 30]), png(4, 3, [40, 50, 60]), png(4, 3, [70, 80, 90])];
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
        // No clip, nothing to check: no shot check is asked, each says why, and nothing is regenerated (F10).
        expect(h.succeeded(run.id).filter((c) => c.stepId === 'shot-check')).toEqual([]);
        expect(ofType(view, 'step-finished', 'shot-check').map((e) => e.data)).toEqual([1, 2, 3, 4].map((shot) => ({ costUsd: 0, skipped: true, note: noClipNote(shot) })));
        expect(ofType(view, 'step-started', 'regenerate')).toEqual([]);
        expect(ofType(view, 'loop-iteration', 'shot-repair')).toEqual([]);
        expect(view.checkpoints.some((c) => c.prompt === BEST_SO_FAR_PROMPT)).toBe(false);
        const sb = (await json(view.run.outputArtifactId!)) as { storyboard: { imageArtifactId?: string; clipArtifactId?: string }[] };
        expect(sb.storyboard.every((s) => s.imageArtifactId && !s.clipArtifactId)).toBe(true);
        // With three references the gate's critic ranks in GREAT mode: two shuffles, our place averaged (2 of 4).
        const gate = h.succeeded(run.id).filter((c) => c.stepId === 'gate-critic');
        expect(gate).toHaveLength(2);
        // Ours is shown as the references are, by its frames: no storyboard text, image prompts or clip lines (BLIND-1).
        for (const g of gate) expect(JSON.stringify((g.request as CompletionRequest).messages)).not.toMatch(/Frame:|Clip: made|Voice-over:|imagePrompt/);
        // Every ad is one image under its label, ours as much as each reference (BLIND-1, the re-check).
        for (const g of gate) {
          const perLabel = new Map<string, number>();
          let label = '';
          for (const p of (g.request as CompletionRequest).messages.flatMap((msg) => msg.content)) {
            if (p.type === 'text') label = /^### ([A-Z])$/.exec(p.text)?.[1] ?? label;
            else perLabel.set(label, (perLabel.get(label) ?? 0) + 1);
          }
          expect([...perLabel.entries()]).toEqual([['A', 1], ['B', 1], ['C', 1], ['D', 1]]);
        }
        expect(view.checkpoints.some((c) => c.prompt === GATE_FAILED_PROMPT)).toBe(false);
        expect(notes(view, 'gate-critic')).toEqual([undefined]);
        const note = await h.store.artifacts.getText((ofType(view, 'step-finished', 'gate-critic')[0]!.data.outputArtifactIds as string[])[0]!);
        expect(note).toBe('- Intent: one feeling, landed.\n- The payoff shot is short.\n');
      } finally {
        h.useKeys(false);
        delete h.responders['critic:media'];
      }
    }, 180_000);
  });
}
