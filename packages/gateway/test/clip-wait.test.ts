/**
 * How long byway waits for a fal clip (the waits design of 2026-10-22, section 2): its video model's wait, chosen in
 * Settings' "How long to wait for an answer" (30, 45, 60 or 75 minutes, "30 minutes (Recommended)"), counts from fal's
 * acceptance of the clip job, and a resumed job keeps that time. When it runs out byway cancels the job, reads fal's
 * answer as for a stop (removed: nothing billed; asked to stop, or a cancel that failed: may have been billed, with the
 * job's id; already done: kept), and never submits it again. The job carries a start deadline below the wait, by clip
 * length, under both of fal's names for it; the last frame is bounded by the time left on its clip's wait plus 2 minutes.
 *
 * setTimeout, clearTimeout and Date are faked (the adapter measures from acceptance by the clock); nothing waits on the
 * real one.
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GatewayError, type VideoRequest } from '@byway/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGateway, type GatewayOptions, type ModelGateway } from '../src/gateway.ts';
import { MemorySpendBook } from '../src/memory-book.ts';
import { encodePng } from '../src/mock/png.ts';
import { FAL_EXTRACT_FRAME, FAL_START_TIMEOUT_HEADERS, falStartTimeoutSeconds, FRAME_GRACE_MS, submitJob, type FalCancel, type FalClientLike } from '../src/providers/fal.ts';
import { fakeFetch, MemoryArtifacts } from './fakes.ts';

const KEYS = { FAL_KEY: '0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6:00112233445566778899aabbccddeeff' };
const MINUTE = 60_000;
const BALANCED_VIDEO = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
const BEST_VIDEO = 'fal-ai/kling-video/v3/pro/image-to-video';
const T0 = Date.parse('2026-10-22T12:00:00.000Z');

let dir: string;
let book: MemorySpendBook;
let artifacts: MemoryArtifacts;
let startFrame: string;
const open: ModelGateway[] = [];

beforeEach(async () => {
  for (const g of open.splice(0)) await g.close();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: T0 });
  dir = mkdtempSync(join(tmpdir(), 'byway-clip-wait-'));
  book = new MemorySpendBook();
  artifacts = new MemoryArtifacts();
  startFrame = (await artifacts.put(encodePng(4, 2, new Uint8Array(24).fill(200)), 'image/png')).id;
});
afterEach(() => {
  vi.useRealTimers();
});

function gateway(over: Partial<GatewayOptions> = {}): ModelGateway {
  const g = createGateway({
    ledgerPath: join(dir, 'ledger.jsonl'),
    artifacts,
    caps: { workspaceCapUsd: () => 100, runCapUsd: () => 50 },
    spendBook: book,
    env: { ...KEYS },
    retry: { sleep: async () => {}, random: () => 0.5 },
    ...over,
  });
  open.push(g);
  return g;
}

const ledger = (): Record<string, unknown>[] =>
  existsSync(join(dir, 'ledger.jsonl')) ? readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : [];

/** A caps source whose answer waits are `chosen` (minutes by "provider/model"), recording what it was asked. */
function waitsOf(chosen: Record<string, number | undefined>) {
  const asked: string[] = [];
  const caps: GatewayOptions['caps'] = {
    workspaceCapUsd: () => 100,
    runCapUsd: () => 50,
    waitMinutes: (_ws, ref) => {
      asked.push(`${ref.provider}/${ref.model}`);
      return chosen[`${ref.provider}/${ref.model}`];
    },
  };
  return { caps, asked };
}

const clipOf = (over: Partial<VideoRequest> = {}): VideoRequest => ({
  workspaceId: 'ws',
  runId: 'run-1',
  stepId: 'clip',
  purpose: 'relay:media',
  profileId: 'balanced',
  prompt: 'Shot 2: the runner crests the ridge at dawn',
  startFrameArtifactId: startFrame,
  durationSec: 5,
  ...over,
});

const failure = async (p: Promise<unknown>): Promise<GatewayError> => {
  const e = await p.then(
    () => undefined,
    (err: unknown) => err,
  );
  if (!(e instanceof GatewayError)) throw new Error(`expected a GatewayError, got ${String(e)}`);
  return e;
};

const aborted = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });

/**
 * A fake fal whose clip job takes `clipTakesMs` and whose frame job takes `frameTakesMs` from their first status poll
 * (undefined: they never finish), each poll ending as the SDK's does once its signal aborts. A cancel answers `cancel`;
 * one that says the job was already done leaves it done. Every submission, poll and cancel is kept, with the clock.
 */
function clipFal(opts: { clipTakesMs?: number; frameTakesMs?: number; cancel?: FalCancel } = {}) {
  const submitted: { endpoint: string; at: number; startTimeoutSeconds?: number }[] = [];
  const polls: { endpoint: string; requestId: string; at: number }[] = [];
  const cancels: { endpoint: string; requestId: string; at: number }[] = [];
  const done = new Set<string>();
  const client: FalClientLike = {
    storage: { upload: async () => 'https://v3.fal.media/files/upload-0.png' },
    queue: {
      async submit(endpoint, options) {
        submitted.push({ endpoint, at: Date.now(), ...(options.startTimeoutSeconds !== undefined ? { startTimeoutSeconds: options.startTimeoutSeconds } : {}) });
        return { request_id: `req-${submitted.length}` };
      },
      subscribeToStatus(endpoint, options) {
        polls.push({ endpoint, requestId: options.requestId, at: Date.now() });
        if (done.has(options.requestId)) return Promise.resolve({ status: 'COMPLETED' });
        const takes = endpoint === FAL_EXTRACT_FRAME ? opts.frameTakesMs : opts.clipTakesMs;
        return new Promise((resolve, reject) => {
          const timer = takes === undefined ? undefined : setTimeout(() => (done.add(options.requestId), resolve({ status: 'COMPLETED' })), takes);
          options.abortSignal?.addEventListener('abort', () => (clearTimeout(timer), reject(aborted())), { once: true });
        });
      },
      async result(endpoint, options) {
        const data = endpoint === FAL_EXTRACT_FRAME ? { images: [{ url: 'https://v3.fal.media/files/last.png', content_type: 'image/png' }] } : { video: { url: 'https://v3.fal.media/files/clip.mp4', content_type: 'video/mp4' } };
        return { data, requestId: options.requestId };
      },
      async cancel(endpoint, options) {
        cancels.push({ endpoint, requestId: options.requestId, at: Date.now() });
        const answer = opts.cancel ?? { status: 'failed', detail: 'the fake has no cancel answer' };
        if (answer.status === 'completed') done.add(options.requestId);
        return answer;
      },
    },
  };
  return { client, submitted, polls, cancels };
}

/** One turn of the real event loop (setImmediate is not faked): the gateway's file reads and writes get to finish. */
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * `p`, once it settles, with the fake clock moved on a tenth of a second at a time meanwhile (at most 200 seconds): what
 * follows a clip's answer (keeping it, writing its ledger entry under the ledger's lock) waits on files and timers.
 */
async function settled<T>(p: Promise<T>): Promise<T> {
  let done = false;
  const out = p.finally(() => (done = true));
  for (let i = 0; i < 2000 && !done; i++) {
    await turn();
    await vi.advanceTimersByTimeAsync(100);
  }
  return out;
}

/** Settles once `fal` has been polled `n` times in all, the fake clock left where it is. */
async function polled(fal: { polls: unknown[] }, n: number): Promise<void> {
  for (let i = 0; i < 20_000 && fal.polls.length < n; i++) await turn();
  expect(fal.polls.length).toBeGreaterThanOrEqual(n);
}

const TAIL = "To wait longer, change 'How long to wait for an answer' in Settings.";
const lateClip = (model: string, job: string, minutes: number, cancel: string, billed: boolean) =>
  `fal.ai’s model ${model} did not finish clip job ${job} within ${minutes} minutes, the wait chosen in Settings, so byway stopped waiting and cancelled it: ${cancel}. ${billed ? 'It may have billed the work. ' : ''}${TAIL}`;

describe('a fal clip waits its video model’s wait from fal’s acceptance, then is cancelled and never submitted again', () => {
  it.each([undefined, 30, 45, 60, 75])('cancelled at its wait (%s minutes; none chosen: 30) and not a moment before: may have been billed, listed with its job as waited', async (chosen) => {
    const minutes = chosen ?? 30;
    const waits = waitsOf({ [`fal/${BALANCED_VIDEO}`]: chosen });
    const fal = clipFal({ cancel: { status: 'requested', detail: 'HTTP 202 CANCELLATION_REQUESTED' } });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch, caps: waits.caps });
    const err = failure(g.video(clipOf()));
    await polled(fal, 1);
    expect(fal.submitted.map((s) => s.at)).toEqual([T0]);
    await vi.advanceTimersByTimeAsync(minutes * MINUTE - 1);
    expect(fal.cancels).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    const e = await err;
    expect(fal.cancels).toEqual([{ endpoint: BALANCED_VIDEO, requestId: 'req-1', at: T0 + minutes * MINUTE }]);
    const cancel = 'fal was asked to stop it while it ran (HTTP 202 CANCELLATION_REQUESTED), and it can still finish it';
    expect(e).toMatchObject({ code: 'provider-error', retryable: false, billing: 'maybe', message: lateClip(BALANCED_VIDEO, 'req-1', minutes, cancel, true), waited: { minutes, how: 'clip', cancel } });
    // Never submitted again, and no frame job.
    await vi.advanceTimersByTimeAsync(minutes * MINUTE);
    expect(fal.submitted.map((s) => s.endpoint)).toEqual([BALANCED_VIDEO]);
    expect(ledger()).toEqual([]);
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ provider: 'fal', reason: 'waited', providerJobs: { generation: 'req-1' }, waited: { minutes, how: 'clip', cancel } })]);
    // Read once, before the call, for its own model.
    expect(waits.asked).toEqual([`fal/${BALANCED_VIDEO}`]);
  });

  it('removed from fal’s queue before it ran: nothing was billed, and nothing is counted', async () => {
    const fal = clipFal({ cancel: { status: 'removed', detail: 'HTTP 200 OK' } });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const err = failure(g.video(clipOf()));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    const cancel = 'fal removed it from its queue before it ran (HTTP 200 OK), so nothing was billed';
    expect(await err).toMatchObject({ retryable: false, billing: 'none', billed: false, message: lateClip(BALANCED_VIDEO, 'req-1', 30, cancel, false) });
    expect(fal.submitted).toHaveLength(1);
    expect(ledger()).toEqual([]);
    expect(await g.spendRecords('ws')).toMatchObject({ inFlight: [], uncertain: [] });
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0, inFlightUsd: 0, uncertainUsd: 0 });
  });

  it('a cancel that did not go through: may have been billed, with its job’s id', async () => {
    const fal = clipFal({ cancel: { status: 'failed', detail: 'HTTP 404 NOT_FOUND' } });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const err = failure(g.video(clipOf()));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    const cancel = 'byway’s cancel did not go through (HTTP 404 NOT_FOUND)';
    expect(await err).toMatchObject({ billing: 'maybe', message: lateClip(BALANCED_VIDEO, 'req-1', 30, cancel, true) });
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ reason: 'waited', providerJobs: { generation: 'req-1' }, waited: { minutes: 30, how: 'clip', cancel } })]);
  });

  it('already done when its wait ran out: the clip is kept and used, since it is paid for, with its last frame', async () => {
    const fal = clipFal({ cancel: { status: 'completed', detail: 'HTTP 400 ALREADY_COMPLETED' }, frameTakesMs: MINUTE });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const res = g.video(clipOf());
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    await polled(fal, 3);
    await vi.advanceTimersByTimeAsync(MINUTE);
    const clip = await settled(res);
    expect(clip.costUsd).toBeGreaterThan(0);
    expect(fal.cancels).toEqual([{ endpoint: BALANCED_VIDEO, requestId: 'req-1', at: T0 + 30 * MINUTE }]);
    expect(fal.submitted.map((s) => s.endpoint)).toEqual([BALANCED_VIDEO, FAL_EXTRACT_FRAME]);
    expect(ledger()).toEqual([expect.objectContaining({ provider: 'fal', kind: 'video', costUsd: clip.costUsd })]);
    expect((await g.spendRecords('ws')).uncertain).toEqual([]);
  });

  it('a clip fal finishes within its wait is never cancelled, however long it took', async () => {
    const fal = clipFal({ clipTakesMs: 30 * MINUTE - 1, frameTakesMs: 0 });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const res = g.video(clipOf());
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(30 * MINUTE - 1);
    expect((await settled(res)).costUsd).toBeGreaterThan(0);
    // Its wait and its frame's bound ended with it: no timer of the call is left waiting to fire.
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(fal.cancels).toEqual([]);
  });

  it.each([
    ['a choice its kind does not offer (15 minutes)', { [`fal/${BALANCED_VIDEO}`]: 15 }, undefined, 30],
    ['a relay step’s wait, without reading Settings', { [`fal/${BALANCED_VIDEO}`]: 75 }, 45, 45],
  ] as const)('waits its kind’s default for %s', async (_what, chosen, waitMinutes, minutes) => {
    const waits = waitsOf(chosen);
    const fal = clipFal({ cancel: { status: 'requested', detail: 'HTTP 202' } });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch, caps: waits.caps });
    const until = new AbortController();
    const err = failure(g.video(clipOf(waitMinutes ? { operation: { key: 'run-1/clip/video/abc/1', until: until.signal, waitMs: waitMinutes * MINUTE } } : {})));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(minutes * MINUTE - 1);
    expect(fal.cancels).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(await err).toMatchObject({ waited: { minutes } });
    expect(waits.asked).toEqual(waitMinutes ? [] : [`fal/${BALANCED_VIDEO}`]);
  });
});

describe('a resumed clip keeps its clock: its wait counts from when fal accepted it, as the spend book recorded', () => {
  it('an earlier attempt’s job accepted 20 minutes ago is cancelled 10 minutes into the resume, at its 30, and polled by its id, never submitted again', async () => {
    const key = 'run-1/clip/video/abc/1';
    // An earlier attempt of the step: admitted, sent, its clip job accepted at T0, and then its worker gone.
    await book.admit({ opId: 'earlier', owner: 'gone', leaseMs: 60_000, operationKey: key, workspaceId: 'ws', runId: 'run-1', stepId: 'clip', purpose: 'relay:media', kind: 'video', provider: 'fal', model: BALANCED_VIDEO, reserveUsd: 0.5, paid: true, caps: { workspaceUsd: 100, runUsd: 50 } });
    await book.markSent('earlier', 'gone');
    await book.accept('earlier', 'generation', 'req-earlier');
    await vi.advanceTimersByTimeAsync(20 * MINUTE);
    const fal = clipFal({ cancel: { status: 'requested', detail: 'HTTP 202 CANCELLATION_REQUESTED' } });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const until = new AbortController();
    const err = failure(g.video(clipOf({ operation: { key, until: until.signal } })));
    await polled(fal, 1);
    expect(fal.polls[0]).toMatchObject({ endpoint: BALANCED_VIDEO, requestId: 'req-earlier', at: T0 + 20 * MINUTE });
    await vi.advanceTimersByTimeAsync(10 * MINUTE - 1);
    expect(fal.cancels).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(await err).toMatchObject({ waited: { minutes: 30, how: 'clip' }, message: expect.stringContaining('clip job req-earlier within 30 minutes') });
    expect(fal.cancels).toEqual([{ endpoint: BALANCED_VIDEO, requestId: 'req-earlier', at: T0 + 30 * MINUTE }]);
    expect(fal.submitted).toEqual([]);
  });
});

describe('fal’s start deadline: below the wait by about one clip’s making, under both of fal’s names', () => {
  it.each([
    [30, 3, 25],
    [30, 5, 25],
    [30, 6, 20],
    [30, 10, 20],
    [30, 11, 15],
    [30, 15, 15],
    [75, 5, 70],
    [45, 10, 35],
    [60, 15, 45],
  ])('a %s-minute wait for a %s-second clip starts it within %s minutes', (wait, seconds, minutes) => {
    expect(falStartTimeoutSeconds(wait * MINUTE, seconds)).toBe(minutes * 60);
  });

  it('leaves it out when the wait leaves no time to start (fal takes none of a second or less)', () => {
    expect(falStartTimeoutSeconds(5 * MINUTE, 5)).toBeUndefined();
    expect(falStartTimeoutSeconds(5 * MINUTE + 1000, 5)).toBeUndefined();
    expect(falStartTimeoutSeconds(5 * MINUTE + 2000, 5)).toBe(2);
  });

  it.each([
    ['balanced', BALANCED_VIDEO, 5, 30, 25],
    ['best', BEST_VIDEO, 12, 45, 30],
  ] as const)('%s: the clip job is submitted with its start deadline for its wait and its length; the frame job with none', async (profileId, model, seconds, wait, minutes) => {
    const fal = clipFal({ clipTakesMs: 0, frameTakesMs: 0 });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch, caps: waitsOf({ [`fal/${model}`]: wait }).caps });
    await settled(g.video(clipOf({ profileId, durationSec: seconds })));
    // The clip's wait and its frame's bound ended with the call: no timer of it is left waiting to fire.
    expect(vi.getTimerCount()).toBe(0);
    expect(fal.submitted.map(({ at: _at, ...job }) => job)).toEqual([{ endpoint: model, startTimeoutSeconds: minutes * 60 }, { endpoint: FAL_EXTRACT_FRAME }]);
  });

  it('submitJob sends it under both names, as whole seconds', async () => {
    const seen: Headers[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      return new Response(JSON.stringify({ request_id: 'req-1' }), { status: 200 });
    }) as typeof fetch;
    await submitJob(fetchImpl, KEYS.FAL_KEY, BALANCED_VIDEO, { prompt: 'p' }, 1500);
    await submitJob(fetchImpl, KEYS.FAL_KEY, BALANCED_VIDEO, { prompt: 'p' });
    expect(FAL_START_TIMEOUT_HEADERS).toEqual(['X-Fal-Request-Start-Timeout', 'x-fal-request-timeout']);
    expect([seen[0]?.get('X-Fal-Request-Start-Timeout'), seen[0]?.get('x-fal-request-timeout')]).toEqual(['1500', '1500']);
    expect([seen[1]?.get('X-Fal-Request-Start-Timeout'), seen[1]?.get('x-fal-request-timeout')]).toEqual([null, null]);
  });
});

describe('the last frame is bounded by the time left on its clip’s wait plus 2 minutes; the clip is kept either way', () => {
  it.each([
    ['finished 25 minutes in: 5 left, so 7 minutes', 25 * MINUTE, 7 * MINUTE],
    ['finished in a minute: 29 left, so 31 minutes', MINUTE, 31 * MINUTE],
  ])('a frame job that does not finish, its clip %s, is cancelled then; the clip is ledgered and kept', async (_what, clipTakesMs, boundMs) => {
    const fal = clipFal({ clipTakesMs, cancel: { status: 'requested', detail: 'HTTP 202 CANCELLATION_REQUESTED' } });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const err = failure(g.video(clipOf()));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(clipTakesMs);
    await polled(fal, 2);
    const frameFrom = Date.now();
    expect(fal.submitted.map((s) => s.endpoint)).toEqual([BALANCED_VIDEO, FAL_EXTRACT_FRAME]);
    await vi.advanceTimersByTimeAsync(boundMs - 1);
    expect(fal.cancels).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    const e = await settled(err);
    expect(fal.cancels).toEqual([{ endpoint: FAL_EXTRACT_FRAME, requestId: 'req-2', at: frameFrom + boundMs }]);
    expect(e).toMatchObject({ billed: true });
    expect(e.message).toMatch(/^fal made the clip and billed it, but its last frame could not be extracted \(the clip is kept as sha256:[0-9a-f]{64}\): last-frame job req-2 did not finish within the time left on the clip’s wait plus 2 minutes, so byway stopped waiting and cancelled it \(HTTP 202 CANCELLATION_REQUESTED\)$/);
    expect(ledger()).toEqual([expect.objectContaining({ provider: 'fal', kind: 'video' })]);
  });

  it('a clip done only after its wait ran out (fal’s cancel said so) leaves its frame the 2 minutes alone', async () => {
    const fal = clipFal({ cancel: { status: 'completed', detail: 'HTTP 400 ALREADY_COMPLETED' } });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const err = failure(g.video(clipOf()));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    await polled(fal, 3);
    await vi.advanceTimersByTimeAsync(FRAME_GRACE_MS - 1);
    expect(fal.cancels).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await settled(err)).message).toMatch(/last-frame job req-2 did not finish within the time left on the clip’s wait plus 2 minutes/);
    expect(fal.cancels.map((c) => [c.endpoint, c.at])).toEqual([
      [BALANCED_VIDEO, T0 + 30 * MINUTE],
      [FAL_EXTRACT_FRAME, T0 + 30 * MINUTE + FRAME_GRACE_MS],
    ]);
  });

  it('the frame’s download is bounded too: one held past it is given up, and the clip kept', async () => {
    const frames: AbortSignal[] = [];
    const media = fakeFetch();
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      if (!String(input).endsWith('last.png')) return media.fetch(input, init);
      const signal = init?.signal as AbortSignal;
      frames.push(signal);
      return new Promise<Response>((_, reject) => signal.addEventListener('abort', () => reject(aborted()), { once: true }));
    }) as typeof fetch;
    const fal = clipFal({ clipTakesMs: 28 * MINUTE, frameTakesMs: MINUTE });
    const g = gateway({ clients: { fal: fal.client }, fetch: fetchImpl });
    const err = failure(g.video(clipOf()));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(28 * MINUTE);
    await polled(fal, 2);
    await vi.advanceTimersByTimeAsync(MINUTE);
    for (let i = 0; i < 20_000 && frames.length === 0; i++) await turn();
    expect(frames).toHaveLength(1);
    // 2 minutes left on the clip's wait and 2 more: 4 minutes from the frame job's start, 3 of them left now.
    await vi.advanceTimersByTimeAsync(3 * MINUTE - 1);
    expect(frames[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await settled(err)).message).toMatch(/the last frame’s download did not finish within the time left on the clip’s wait plus 2 minutes, so byway stopped waiting$/);
    expect(ledger()).toEqual([expect.objectContaining({ provider: 'fal', kind: 'video' })]);
  });
});
