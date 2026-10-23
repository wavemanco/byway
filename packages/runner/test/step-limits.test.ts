/**
 * The steps' own limits (WAITS-STEP-LIMITS; the waits design of 2026-10-22, section 4), as the owner chose them on
 * 2026-10-22, "Relay from your video wait, 24 h elsewhere (Recommended)": "The video (relay) step is sized from your
 * video wait, as your video choice said. Model and image steps get a 24-hour backstop that the per-call waits normally
 * make unnecessary; a stuck step could hold its run up to 24 hours a try (72 for a model step's 3 tries). No healthy
 * step is ever cut short, and no clip is bought twice."
 *
 * - The proxies' options, read back: model and image steps run under 24 hours with the heartbeat and tries they had,
 *   quick steps a minute, and a relay step's limit is 5 times its link model's wait plus its video wait plus 15 minutes,
 *   at the defaults and at the longest choices.
 * - The waits read just before a relay step (relayWaits): the link model's and the video model's, from Settings, for the
 *   run's workspace and profile, by the gateway's own rule.
 * - A relay step's calls keep the waits it was handed, though they are raised in Settings during the step, and its
 *   memo keys do not move with them.
 * - Through the real workflow, on Temporal's own history: which limit each activity was scheduled under, the waits read
 *   a quick activity scheduled before each relay step and handed to it, and the history replaying without a mismatch
 *   once Settings have changed.
 * No wall clock: limits are read from the options and from Temporal's history, never timed.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultPayloadConverter, type Payload } from '@temporalio/common';
import { Worker } from '@temporalio/worker';
import type { CompletionRequest, CompletionResult, Gateway, ModelProfile, ModelRef, VideoRequest } from '@byway/contracts';
import { mockAdapter, PROFILES, WAIT_CHOICES } from '@byway/gateway';
import { step } from '@byway/recipe';
import { createActivities } from '../src/activities/index.ts';
import { DEFAULT_RELAY_WAITS, relayWaits } from '../src/activities/relay.ts';
import { serializeJson } from '../src/formats.ts';
import { toStepSpec, workflowIdFor, type RelayWaits, type RunRef, type StepSpec } from '../src/types.ts';
import { MEDIA_OPTIONS, MODEL_OPTIONS, QUICK_OPTIONS, RELAY_ALLOWANCE_MS, relayLimitMs, relayOptions } from '../src/workflow/acts.ts';
import { storeBrief } from './helpers/briefs.ts';
import { png } from './helpers/fake-pages.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createHarness, type Harness } from './helpers/harness.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';
import { shortAd } from './helpers/recipes.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const LONGEST: RelayWaits = { linkMs: 60 * MINUTE, videoMs: 75 * MINUTE };

const BALANCED = PROFILES.find((p) => p.id === 'balanced')!;
const DEMO = PROFILES.find((p) => p.id === 'demo')!;
/** The balanced profile's models a relay step's calls use: its mid tier for the link call, its video model for the clip. */
const LINK_MODEL = BALANCED.tiers.mid;
const VIDEO_MODEL = BALANCED.video!;

/** C5's relay step, as the test recipes write it: the mid tier, from the anchor and the storyboard. */
const clip: StepSpec = toStepSpec(step({ id: 'clip', role: 'relay', block: 'RELAY', actor: 'model', tier: 'mid', prompt: 'product.test.clip', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], writes: true }));

describe('the proxies’ limits, read back', () => {
  it('a model step and an image step run under a 24-hour backstop, with the heartbeat and the tries they had', () => {
    expect(MODEL_OPTIONS).toMatchObject({ startToCloseTimeout: '24 hours', heartbeatTimeout: '30 seconds', retry: { maximumAttempts: 3 } });
    expect(MEDIA_OPTIONS).toMatchObject({ startToCloseTimeout: '24 hours', heartbeatTimeout: '30 seconds', retry: { maximumAttempts: 2 } });
    for (const o of [MODEL_OPTIONS, MEDIA_OPTIONS]) expect(o.retry).toMatchObject({ initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '30 seconds', nonRetryableErrorTypes: QUICK_OPTIONS.retry?.nonRetryableErrorTypes });
  });

  it('a quick step keeps its minute and its five tries, and no heartbeat', () => {
    expect(QUICK_OPTIONS).toMatchObject({ startToCloseTimeout: '1 minute', retry: { maximumAttempts: 5 } });
    expect(QUICK_OPTIONS.heartbeatTimeout).toBeUndefined();
  });

  it('a relay step’s limit is 5 times its link model’s wait, plus its video wait, plus 15 minutes: 2 hours at the defaults, 6.5 at the longest choices', () => {
    expect(RELAY_ALLOWANCE_MS).toBe(15 * MINUTE);
    expect(DEFAULT_RELAY_WAITS).toEqual({ linkMs: 15 * MINUTE, videoMs: 30 * MINUTE });
    expect(relayOptions(DEFAULT_RELAY_WAITS)).toMatchObject({ startToCloseTimeout: 2 * HOUR, heartbeatTimeout: '30 seconds', retry: { maximumAttempts: 2 } });
    expect(relayOptions(LONGEST)).toMatchObject({ startToCloseTimeout: 6.5 * HOUR, heartbeatTimeout: '30 seconds', retry: { maximumAttempts: 2 } });
    // Every pair of choices a person can make, by the design's formula.
    for (const link of WAIT_CHOICES.text) {
      for (const video of WAIT_CHOICES.video) expect(relayLimitMs({ linkMs: link * MINUTE, videoMs: video * MINUTE })).toBe((5 * link + video + 15) * MINUTE);
    }
  });
});

let dir: string;
let store: MemoStore;
let workspaceId: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-step-limits-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

async function newRun(profileId: string): Promise<RunRef> {
  const run = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId: 'short-ad', recipeHash: 'sha256:x', profileId, title: 't', problem: 'p', medium: 'media', budgetUsd: 5 });
  await store.updateRun(run.id, { status: 'running' });
  return { runId: run.id, workspaceId, recipeId: 'short-ad', profileId, medium: 'media', problemId: await storeBrief(store.artifacts, { text: 'An ad for a cup' }) };
}

/**
 * A gateway out of demo mode whose profiles are byway's own, with every kind of model usable: it answers a relay link
 * and makes a clip, and keeps each request. `during` runs inside the link call, before it answers.
 */
function linkGateway(during?: () => Promise<void>, demo = false) {
  const completions: CompletionRequest[] = [];
  const videos: VideoRequest[] = [];
  const status = (profile: ModelProfile) => ({ profile, usable: true, missing: [], images: true, video: true, otherFamily: true });
  const answer = (text: string): CompletionResult => ({ text, stopReason: 'end', servedModel: LINK_MODEL.model, provider: 'anthropic', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, ledgerEntryId: `l${completions.length}` });
  const gateway: Gateway = {
    demo,
    async complete(req) {
      completions.push(req);
      await during?.();
      return answer('```json\n{"clipPrompt":"The cup turns","durationSec":3}\n```');
    },
    image: async () => {
      throw new Error('no images here');
    },
    async video(req) {
      videos.push(req);
      const made = await store.artifacts.putText(`<svg>clip ${videos.length}</svg>`, 'image/svg+xml');
      const frame = await store.artifacts.put(png(4, 3, [9, 9, 9]), 'image/png');
      return { artifactId: made.id, mediaType: 'image/svg+xml', lastFrameArtifactId: frame.id, lastFrameMediaType: 'image/png', servedModel: VIDEO_MODEL.model, provider: 'fal', costUsd: 0, ledgerEntryId: 'v' };
    },
    spend: async (id) => ({ workspaceId: id, spentUsd: 0, capUsd: 100, byRun: {} }),
    providers: () => [],
    profiles: () => PROFILES.slice(),
    profileStatus: () => PROFILES.map(status),
    verifyLedger: async () => null,
    spendRecords: async () => ({ inFlight: [], uncertain: [], faults: [], notInAuditFile: 0, setAside: [] }),
    auditLedger: async () => ({ brokenAt: null, missing: [], pending: 0, setAside: [], openFaults: 0 }),
    close: async () => undefined,
  };
  return { gateway, completions, videos };
}

const choose = (ref: ModelRef, minutes: number) => store.setAnswerWait(workspaceId, { provider: ref.provider, model: ref.model, minutes });

describe('the waits read just before a relay step (relayWaits)', () => {
  const read = async (profileId: string, s: StepSpec = clip, demo = false) => relayWaits({ gateway: linkGateway(undefined, demo).gateway, store, prompts: fakePrompts() }, { run: await newRun(profileId), step: s });

  it('with nothing chosen, a text model’s default for the link and a video model’s for the clip', async () => {
    expect(await read('balanced')).toEqual({ linkMs: 15 * MINUTE, videoMs: 30 * MINUTE });
  });

  it('what was chosen for the profile’s link model (its model for the step’s tier) and for its video model, each by provider and model', async () => {
    await choose(LINK_MODEL, 45);
    await choose(VIDEO_MODEL, 60);
    // Another profile's models, and the same model from another provider, are not this run's.
    await choose(PROFILES.find((p) => p.id === 'best')!.video!, 75);
    await choose({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5' }, 60);
    expect(await read('balanced')).toEqual({ linkMs: 45 * MINUTE, videoMs: 60 * MINUTE });
    // A relay step on the big tier asks the profile's big model, whose wait is its own.
    await choose(BALANCED.tiers.big, 30);
    expect(await read('balanced', { ...clip, tier: 'big' })).toEqual({ linkMs: 30 * MINUTE, videoMs: 60 * MINUTE });
  });

  it('at the longest choices, 60 and 75 minutes: the step’s limit is six and a half hours', async () => {
    await choose(LINK_MODEL, 60);
    await choose(VIDEO_MODEL, 75);
    const waits = await read('balanced');
    expect(waits).toEqual(LONGEST);
    expect(relayLimitMs(waits)).toBe(6.5 * HOUR);
  });

  it('a choice the model’s kind does not offer is not used, as the gateway does not use it', async () => {
    await choose(LINK_MODEL, 20);
    await choose(VIDEO_MODEL, 15);
    expect(await read('balanced')).toEqual(DEFAULT_RELAY_WAITS);
  });

  it('the demo’s mock models, a profile of mock models and a profile byway does not list wait the defaults', async () => {
    await choose(LINK_MODEL, 60);
    await choose(VIDEO_MODEL, 75);
    await choose(DEMO.tiers.mid, 60);
    // Demo mode: every call goes to the mock, whatever profile the run names.
    expect(await read('balanced', clip, true)).toEqual(DEFAULT_RELAY_WAITS);
    expect(await read('demo')).toEqual(DEFAULT_RELAY_WAITS);
    expect(await read('no-such-profile')).toEqual(DEFAULT_RELAY_WAITS);
  });
});

describe('a relay step’s calls keep the waits it was handed', () => {
  /** A storyboard of one shot and the still it starts from. */
  async function board(): Promise<{ id: string; still: string }> {
    const still = (await store.artifacts.put(png(4, 3, [11, 11, 11]), 'image/png')).id;
    const text = serializeJson({ storyboard: [{ shot: 1, description: 'Shot 1: the cup', imagePrompt: 'cup', durationSec: 3, imageArtifactId: still }], voiceover: 'Less waste.' });
    return { id: (await store.artifacts.putText(text, 'application/json')).id, still };
  }

  it('a wait raised in Settings as the step begins and during it changes none of its calls; the next step reads it; and the step run again under other waits buys nothing again', async () => {
    // Raised again while the link call is under way, before the clip is asked for.
    const raise = async () => {
      await choose(LINK_MODEL, 60);
      await choose(VIDEO_MODEL, 75);
    };
    const g = linkGateway(raise);
    const acts = createActivities({ gateway: g.gateway, store, prompts: fakePrompts() });
    const run = await newRun('balanced');
    const { id, still } = await board();
    const waits = await acts.relayWaits({ run, step: clip });
    expect(waits).toEqual(DEFAULT_RELAY_WAITS);
    // Raised once the waits were read, as the step begins.
    await choose(LINK_MODEL, 45);
    await choose(VIDEO_MODEL, 60);
    const input = { run, call: { key: `${run.runId}/clip/-/1`, stepId: 'clip', stage: 'D2' as const }, step: clip, ports: { artifact: id, anchor: still }, shot: 1, waits };
    expect((await acts.relayLink(input)).artifactId).toBeDefined();
    // The link call and the clip keep what was read before the step.
    expect(g.completions.map((r) => r.operation?.waitMs)).toEqual([15 * MINUTE]);
    expect(g.videos.map((r) => r.operation?.waitMs)).toEqual([30 * MINUTE]);
    // The memo layer completed each call's operation: its key and the invocation's end beside the wait.
    for (const r of [...g.completions, ...g.videos]) expect(r.operation).toMatchObject({ key: expect.stringMatching(new RegExp(`^${run.runId}/`)), until: expect.any(AbortSignal) });
    // The next relay step reads the raised waits.
    expect(await acts.relayWaits({ run, step: clip })).toEqual(LONGEST);
    // The same step run again (Temporal's retry, or after a budget raise), here under other waits: its calls are found in
    // the memo under the keys they had, and nothing is bought again.
    await acts.relayLink({ ...input, waits: LONGEST });
    expect(g.completions).toHaveLength(1);
    expect(g.videos).toHaveLength(1);
  });
});

/** A Temporal Duration as the history gives it ({ seconds, nanos }, seconds a Long), in milliseconds. */
const durationMs = (d: { seconds?: unknown; nanos?: number | null } | null | undefined): number | undefined => {
  if (!d) return undefined;
  const s = d.seconds as { toNumber?: () => number } | number | string | null | undefined;
  const seconds = typeof s === 'object' && s !== null && typeof s.toNumber === 'function' ? s.toNumber() : Number(s ?? 0);
  return seconds * 1000 + (d.nanos ?? 0) / 1e6;
};
const decoded = (p: Payload | null | undefined): unknown => (p ? defaultPayloadConverter.fromPayload(p as never) : undefined);

interface Scheduled {
  name: string;
  startToCloseMs: number | undefined;
  heartbeatMs: number | undefined;
  attempts: number | undefined;
  input: unknown;
  result?: unknown;
}

describe('through the real workflow, on Temporal’s history', () => {
  let h: Harness;
  beforeAll(async () => {
    // The keyed gateway's Anthropic models are answered by the demo's mock, so a balanced run's link model is a real one
    // whose wait can be chosen; fal and Google have no key there, so its clips and images finish skipped, after their
    // steps were scheduled.
    h = await createHarness({ adapters: { anthropic: mockAdapter() } });
  }, 120_000);
  afterAll(async () => {
    await h?.close();
  }, 60_000);

  /** The run's history once it has closed, and every activity it scheduled, in order, with its options and result. */
  async function scheduled(runId: string) {
    const handle = h.env.client.workflow.getHandle(workflowIdFor(runId));
    await handle.result();
    const history = await handle.fetchHistory();
    const byEvent = new Map<string, Scheduled>();
    const out: Scheduled[] = [];
    for (const e of history.events ?? []) {
      const s = e.activityTaskScheduledEventAttributes;
      if (s) {
        const item: Scheduled = { name: s.activityType?.name ?? '', startToCloseMs: durationMs(s.startToCloseTimeout), heartbeatMs: durationMs(s.heartbeatTimeout), attempts: s.retryPolicy?.maximumAttempts ?? undefined, input: decoded(s.input?.payloads?.[0]) };
        byEvent.set(String(e.eventId), item);
        out.push(item);
      }
      const c = e.activityTaskCompletedEventAttributes;
      if (c) {
        const item = byEvent.get(String(c.scheduledEventId));
        if (item) item.result = decoded(c.result?.payloads?.[0]);
      }
    }
    return { history, out };
  }

  const LONG = new Set(['modelStep', 'renderView', 'finishHumanStep', 'rerank']);

  /** What the design asks of every activity a run scheduled; the relay steps' waits, as read before each. */
  function checkLimits(out: Scheduled[]): RelayWaits[] {
    const read: RelayWaits[] = [];
    out.forEach((a, i) => {
      if (LONG.has(a.name)) expect(a, a.name).toMatchObject({ startToCloseMs: DAY, heartbeatMs: 30_000, attempts: 3 });
      else if (a.name === 'assetStep') expect(a, a.name).toMatchObject({ startToCloseMs: DAY, heartbeatMs: 30_000, attempts: 2 });
      else if (a.name === 'relayLink') {
        // Read by the quick activity scheduled just before it, and handed to it: its limit is worked out from them.
        const before = out[i - 1];
        expect(before?.name).toBe('relayWaits');
        const waits = before!.result as RelayWaits;
        expect((a.input as { waits: RelayWaits }).waits).toEqual(waits);
        expect(a).toMatchObject({ startToCloseMs: relayLimitMs(waits), heartbeatMs: 30_000, attempts: 2 });
        read.push(waits);
        // A quick step: a minute, five tries, and no heartbeat (the history records none as zero).
      } else expect(a, a.name).toMatchObject({ startToCloseMs: MINUTE, heartbeatMs: 0, attempts: 5 });
    });
    return read;
  }

  const histories: { runId: string; history: Awaited<ReturnType<typeof scheduled>>['history'] }[] = [];

  it('in demo mode: model and image steps under 24 hours, the waits read as a quick step before each relay step, and each relay step under 2 hours, from the defaults', async () => {
    const run = await h.start(shortAd, { problem: { text: 'A 10-second ad for a reusable cup' } });
    const view = await h.drive(run.id);
    expect(view.run.status).toBe('done');
    const { history, out } = await scheduled(run.id);
    for (const name of ['modelStep', 'renderView', 'assetStep', 'relayWaits', 'relayLink']) expect(out.map((a) => a.name)).toContain(name);
    const read = checkLimits(out);
    // Two links (each shot check is clean, so nothing is regenerated): two relay steps, each with its own reading.
    expect(read).toEqual([DEFAULT_RELAY_WAITS, DEFAULT_RELAY_WAITS]);
    expect(out.filter((a) => a.name === 'relayLink').map((a) => a.startToCloseMs)).toEqual([2 * HOUR, 2 * HOUR]);
    histories.push({ runId: run.id, history });
  }, 120_000);

  it('a balanced run with its link and video models at the longest choices: each relay step under six and a half hours', async () => {
    h.useKeys(true);
    try {
      await h.store.setAnswerWait(h.workspaceId, { ...LINK_MODEL, minutes: 60 });
      await h.store.setAnswerWait(h.workspaceId, { ...VIDEO_MODEL, minutes: 75 });
      const run = await h.start(shortAd, { profileId: 'balanced', problem: { text: 'A 10-second ad for a reusable cup' } });
      await h.drive(run.id);
      const { history, out } = await scheduled(run.id);
      const read = checkLimits(out);
      expect(read.length).toBeGreaterThan(0);
      for (const w of read) expect(w).toEqual(LONGEST);
      expect(out.filter((a) => a.name === 'relayLink').every((a) => a.startToCloseMs === 6.5 * HOUR)).toBe(true);
      histories.push({ runId: run.id, history });
    } finally {
      h.useKeys(false);
    }
  }, 120_000);

  it('the waits are read once, into the history: both runs replay without a mismatch after Settings change', async () => {
    expect(histories).toHaveLength(2);
    await h.store.setAnswerWait(h.workspaceId, { ...LINK_MODEL, minutes: 15 });
    await h.store.setAnswerWait(h.workspaceId, { ...VIDEO_MODEL, minutes: 30 });
    for (const { runId, history } of histories) await Worker.runReplayHistory({ workflowsPath: h.workflowsPath }, history, workflowIdFor(runId));
  }, 120_000);
});
