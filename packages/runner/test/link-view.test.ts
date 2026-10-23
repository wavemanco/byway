/**
 * The shot check sees its clip (F10, ADR-0090). Inside a relay link, the render shows that shot's line, the frame the
 * clip started from and the clip's last frame, under captions (RENDER-1): the check's input depends on the clip, and
 * only on its shot. A shot whose clip was not made has nothing to check. Outside a link the view is as it was.
 * Run with C5's own render and shot-check steps, the real relay activity and the real shot-check template.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { c5, stepPresentation } from '@byway/catalog';
import type { CompletionRequest, CompletionResult, Gateway, VideoRequest } from '@byway/contracts';
import { PROFILES } from '@byway/gateway';
import { createPromptRenderer } from '@byway/prompts';
import { steps } from '@byway/recipe';
import type { RunnerDeps } from '../src/activities/deps.ts';
import { modelStep } from '../src/activities/model-step.ts';
import { DEFAULT_RELAY_WAITS, relayLink } from '../src/activities/relay.ts';
import { LINK_CAPTIONS, renderView, noClipNote } from '../src/activities/render.ts';
import { parseStoryboard, serializeJson } from '../src/formats.ts';
import { toStepSpec, type RunRef, type StepSpec, type View } from '../src/types.ts';
import { storeBrief } from './helpers/briefs.ts';
import { png } from './helpers/fake-pages.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

const library = createPromptRenderer();
let dir: string;
let store: MemoStore;
let workspaceId: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-link-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

const spec = (id: string): StepSpec => toStepSpec(steps(c5).find(({ step }) => step.id === id)!.step);

/** A gateway that records completions and makes clips whose last frames differ by `shade`. */
function gateway(shade: () => number): Gateway & { completions: CompletionRequest[]; videos: VideoRequest[] } {
  const completions: CompletionRequest[] = [];
  const videos: VideoRequest[] = [];
  const demo = PROFILES.find((p) => p.id === 'demo')!;
  const answer = (text: string): CompletionResult => ({ text, stopReason: 'end', servedModel: 's', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, ledgerEntryId: `l${completions.length}` });
  return {
    demo: true,
    completions,
    videos,
    async complete(req) {
      completions.push(req);
      if (req.purpose === 'relay:media') return answer('```json\n{"clipPrompt":"The cup turns","durationSec":3}\n```');
      return answer('No defects.');
    },
    image: async () => {
      throw new Error('no images here');
    },
    async video(req) {
      videos.push(req);
      const clip = await store.artifacts.putText(`<svg>clip ${videos.length}</svg>`, 'image/svg+xml');
      const frame = await store.artifacts.put(png(4, 3, [shade(), 0, 0]), 'image/png');
      return { artifactId: clip.id, mediaType: 'image/svg+xml', lastFrameArtifactId: frame.id, lastFrameMediaType: 'image/png', servedModel: 'mock-video', provider: 'mock', costUsd: 0, ledgerEntryId: 'v' };
    },
    spend: async (id) => ({ workspaceId: id, spentUsd: 0, capUsd: 100, byRun: {} }),
    providers: () => [],
    profiles: () => [],
    profileStatus: () => [{ profile: demo, usable: true, missing: [], images: true, video: true, otherFamily: false }],
    verifyLedger: async () => null,
    spendRecords: async () => ({ inFlight: [], uncertain: [], faults: [], notInAuditFile: 0, setAside: [] }),
    auditLedger: async () => ({ brokenAt: null, missing: [], pending: 0, setAside: [], openFaults: 0 }),
    close: async () => undefined,
  };
}

async function newRun(): Promise<RunRef> {
  const run = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId: 'c5', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium: 'media', budgetUsd: 5 });
  await store.updateRun(run.id, { status: 'running' });
  return { runId: run.id, workspaceId, recipeId: 'c5', profileId: 'demo', medium: 'media', problemId: await storeBrief(store.artifacts, { text: 'An ad for a cup' }) };
}

/** A storyboard of three shots, each with its anchor still, as the anchor-frames step leaves it. */
async function framedStoryboard(): Promise<{ id: string; stills: string[] }> {
  const stills: string[] = [];
  for (const c of [11, 22, 33]) stills.push((await store.artifacts.put(png(4, 3, [c, c, c]), 'image/png')).id);
  const text = serializeJson({ storyboard: [1, 2, 3].map((shot) => ({ shot, description: `Shot ${shot}: the cup`, imagePrompt: `cup ${shot}`, durationSec: 3, imageArtifactId: stills[shot - 1] })), voiceover: 'Less waste.' });
  return { id: (await store.artifacts.putText(text, 'application/json')).id, stills };
}

/** Links 1 and 2 of the chain, then the render and the shot check inside link 2, as the interpreter runs them. */
async function checkShot2(shade: () => number) {
  const g = gateway(shade);
  const deps: RunnerDeps = { gateway: g, store, prompts: library };
  const run = await newRun();
  const { id: board, stills } = await framedStoryboard();
  const call = (stepId: string, n = 1) => ({ key: `${run.runId}/${stepId}/-/${n}`, stepId, stage: 'D2' as const });
  const link1 = await relayLink(deps, { run, call: call('clip'), step: spec('clip'), ports: { artifact: board, anchor: stills[0], shot: 1, linkStart: stills[0] }, shot: 1, waits: DEFAULT_RELAY_WAITS });
  const link2 = await relayLink(deps, { run, call: call('clip', 2), step: spec('clip'), ports: { artifact: link1.artifactId!, anchor: link1.anchor!, shot: 2, linkStart: link1.anchor! }, shot: 2, waits: DEFAULT_RELAY_WAITS });
  const { view } = await renderView(deps, { run, call: call('shot-render'), step: spec('shot-render'), artifactIds: [link2.artifactId!], pool: false, link: { shot: 2, startFrame: link1.anchor! } });
  const before = g.completions.length;
  await modelStep(deps, { run, call: call('shot-check'), step: spec('shot-check'), ports: { view, shot: 2 }, refs: [] });
  const request = g.completions[before]!;
  return { view, request, stills, start: link1.anchor!, last: link2.anchor!, storyboard: link2.artifactId! };
}

const imagesOf = (req: CompletionRequest) => req.messages.flatMap((m) => m.content.flatMap((c) => (c.type === 'image' ? [c.artifactId] : [])));
const textsOf = (req: CompletionRequest) => req.messages.flatMap((m) => m.content.flatMap((c) => (c.type === 'text' ? [c.text] : [])));

describe('the shot check inside a relay link (F10)', () => {
  it('sees exactly the frame its clip started from and the clip’s last frame, under their captions, and that shot’s line', async () => {
    const { request, stills, start, last, view } = await checkShot2(() => 50);
    expect(imagesOf(request)).toEqual([start, last]);
    expect(imagesOf(request)).not.toContain(stills[1]);
    expect(imagesOf(request)).not.toContain(stills[2]);
    const texts = textsOf(request);
    expect(texts).toContain(LINK_CAPTIONS.start);
    expect(texts).toContain(LINK_CAPTIONS.last);
    expect(texts[0]).toContain('Shot 2 (3s): Shot 2: the cup');
    expect(texts[0]).not.toContain('Shot 1 (3s)');
    expect(view.items[0]!.imageArtifactIds).toEqual([start, last]);
  });

  it('two clips with different last frames send different checks', async () => {
    const a = await checkShot2(() => 60);
    const b = await checkShot2(() => 200);
    expect(imagesOf(a.request)[1]).not.toBe(imagesOf(b.request)[1]);
    expect(JSON.stringify(a.request.messages)).not.toBe(JSON.stringify(b.request.messages));
  });

  it('records the clip’s last frame on its shot, beside the clip', async () => {
    const { storyboard, last } = await checkShot2(() => 70);
    const sb = parseStoryboard(await store.artifacts.getText(storyboard));
    expect(sb.ok && sb.value.storyboard[1]).toMatchObject({ shot: 2, clipArtifactId: expect.any(String), lastFrameArtifactId: last });
  });

  it('a shot with no clip has nothing to check, and says why', async () => {
    const deps: RunnerDeps = { gateway: gateway(() => 1), store, prompts: library };
    const run = await newRun();
    const { id: board, stills } = await framedStoryboard();
    const { view } = await renderView(deps, { run, call: { key: `${run.runId}/shot-render/-/1`, stepId: 'shot-render', stage: 'D2' }, step: spec('shot-render'), artifactIds: [board], pool: false, link: { shot: 1, startFrame: stills[0]! } });
    expect(view.items).toEqual([expect.objectContaining({ imageArtifactIds: [], unobservable: noClipNote(1) })]);
    expect(noClipNote(1)).toBe('No clip was made for shot 1, so there is nothing to check.');
  });

  it('outside a link the view is the whole storyboard with every shot’s frame, as before', async () => {
    const deps: RunnerDeps = { gateway: gateway(() => 1), store, prompts: library };
    const run = await newRun();
    const { id: board, stills } = await framedStoryboard();
    const { view } = await renderView(deps, { run, call: { key: `${run.runId}/gate-render/-/1`, stepId: 'gate-render', stage: 'D2' }, step: spec('shot-render'), artifactIds: [board], pool: false });
    const item: View['items'][number] = view.items[0]!;
    expect(item.imageArtifactIds).toEqual(stills);
    expect(item.unobservable).toBeUndefined();
    expect(await store.artifacts.getText(item.textArtifactId!)).toMatch(/^Shot 1 \(3s\)[\s\S]*Shot 3 \(3s\)[\s\S]*Voice-over: Less waste\./);
  });

  it('the shot-check prompt says exactly what it is shown and what it cannot see', () => {
    const p = library.render('product.c5.shot-check', { medium: 'media', view: 'Shot 2 (3s): the cup' });
    expect(p.version).toBe(2);
    const text = `${p.system}\n${p.user}`.toLowerCase();
    for (const caption of Object.values(LINK_CAPTIONS)) expect(text).toContain(caption.toLowerCase().replace(/:$/, ''));
    expect(text).toMatch(/already visible in the start frame/);
    expect(text).toMatch(/motion between the two frames/);
    expect(text).not.toMatch(/the shot's frames as attached images/);
  });

  it('the Motion explainer says the same: the clip’s last frame against the frame it started from, no motion, nothing without video', () => {
    const motion = stepPresentation('c5', 'shot-check')!.explainer;
    expect(motion).toMatch(/last frame is checked for visible defects against the frame it started from/);
    expect(motion).toMatch(/the motion between them is not checked/);
    expect(motion).toMatch(/Without a video provider set up, .* nothing is checked\./);
  });
});
