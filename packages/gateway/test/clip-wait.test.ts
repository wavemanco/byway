/**
 * How long byway waits for a fal clip (the waits design of 2026-10-22, section 2): its video model's wait, chosen in
 * Settings' "How long to wait for an answer" (30, 45, 60 or 75 minutes, "30 minutes (Recommended)"), counts from fal's
 * acceptance of the clip job, and a resumed job keeps that time. When it runs out byway cancels the job, reads fal's
 * answer as for a stop (removed: nothing billed; asked to stop, or a cancel that failed: may have been billed, with the
 * job's id; already done: kept), and never submits it again. The job carries a start deadline below the wait, by clip
 * length, under both of fal's names for it; the last frame is bounded by the time left on its clip's wait plus 2 minutes.
 *
 * setTimeout, clearTimeout and Date are faked (the adapter measures from acceptance by the clock), and no wait here is
 * bounded by the real one or by a count of turns of the event loop: a test waits for what it awaits, however long a
 * loaded machine takes to write the gateway's files, and vitest's hang guard stops one that never comes.
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiError, ValidationError } from '@fal-ai/client';
import { GatewayError, type VideoRequest } from '@byway/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGateway, type GatewayOptions, type ModelGateway } from '../src/gateway.ts';
import { MemorySpendBook } from '../src/memory-book.ts';
import { encodePng } from '../src/mock/png.ts';
import { FAL_EXTRACT_FRAME, FAL_START_TIMEOUT_HEADERS, falStartTimeoutSeconds, FRAME_GRACE_MS, RESULT_LOOK_MS, STOPPED, submitJob, untilEnded, WAITED, type FalCancel, type FalClientLike } from '../src/providers/fal.ts';
import { fakeFetch, MemoryArtifacts } from './fakes.ts';

const KEYS = { FAL_KEY: '0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6:00112233445566778899aabbccddeeff' };
const MINUTE = 60_000;
const BALANCED_VIDEO = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
const BEST_VIDEO = 'fal-ai/kling-video/v3/pro/image-to-video';
const T0 = Date.parse('2026-10-22T12:00:00.000Z');
/** How long one read of a job's status is waited for (fal.ts seenDone: CANCEL_TIMEOUT_MS), as a cancel's answer is. */
const STATUS_BOUND_MS = 30_000;
/** How long a stopped clip's one look at its result is waited for (fal.ts stoppedGeneration: RESULT_LOOK_MS). */
const LOOK_BOUND_MS = 30_000;

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
 * (undefined: they never finish), each poll ending as the SDK's does once its signal aborts. Jobs in `done` are done from
 * the start. A status read of a done job, polled or read once (`status`), answers after `statusTakesMs` when given, as a
 * real round trip does, else at once; `statusFails` makes every one-shot status read throw it, and with `statusHeld`
 * none ever answers. A cancel answers `cancel`; one that says the job was already done leaves it done, and with
 * `finishesAtCancel` the job finishes just as the cancel is sent, whatever it answers. The clip's result read calls
 * `onClipResult` first (a stop arriving while it is under way, say), then throws `clipResultFails` when given, or with
 * `clipResultHeld` never answers; with `frameResultHeld`, the frame job's result read never answers. Every submission,
 * poll and cancel is kept, with the clock, and `log` keeps every status read, poll, result read and cancel in order.
 */
function clipFal(
  opts: {
    clipTakesMs?: number;
    frameTakesMs?: number;
    cancel?: FalCancel;
    clipResultFails?: unknown;
    clipResultHeld?: boolean;
    frameResultHeld?: boolean;
    frameResultFails?: unknown;
    onClipResult?: () => void;
    done?: string[];
    statusTakesMs?: number;
    statusFails?: unknown;
    statusHeld?: boolean;
    finishesAtCancel?: boolean;
  } = {},
) {
  const submitted: { endpoint: string; at: number; startTimeoutSeconds?: number }[] = [];
  const polls: { endpoint: string; requestId: string; at: number }[] = [];
  const cancels: { endpoint: string; requestId: string; at: number }[] = [];
  const log: string[] = [];
  const done = new Set<string>(opts.done);
  /** COMPLETED, after a round trip of `statusTakesMs` when given (ending as the SDK's does once `signal` aborts). */
  const completed = (signal?: AbortSignal): Promise<{ status: string }> =>
    opts.statusTakesMs === undefined
      ? Promise.resolve({ status: 'COMPLETED' })
      : new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve({ status: 'COMPLETED' }), opts.statusTakesMs);
          signal?.addEventListener('abort', () => (clearTimeout(timer), reject(aborted())), { once: true });
        });
  const client: FalClientLike = {
    storage: { upload: async () => 'https://v3.fal.media/files/upload-0.png' },
    queue: {
      async submit(endpoint, options) {
        submitted.push({ endpoint, at: Date.now(), ...(options.startTimeoutSeconds !== undefined ? { startTimeoutSeconds: options.startTimeoutSeconds } : {}) });
        return { request_id: `req-${submitted.length}` };
      },
      subscribeToStatus(endpoint, options) {
        polls.push({ endpoint, requestId: options.requestId, at: Date.now() });
        log.push(`poll ${options.requestId}`);
        if (done.has(options.requestId)) return completed(options.abortSignal);
        const takes = endpoint === FAL_EXTRACT_FRAME ? opts.frameTakesMs : opts.clipTakesMs;
        return new Promise((resolve, reject) => {
          const timer = takes === undefined ? undefined : setTimeout(() => (done.add(options.requestId), resolve({ status: 'COMPLETED' })), takes);
          options.abortSignal?.addEventListener('abort', () => (clearTimeout(timer), reject(aborted())), { once: true });
        });
      },
      async status(_endpoint, options) {
        log.push(`status ${options.requestId}`);
        if (opts.statusFails !== undefined) throw opts.statusFails;
        if (opts.statusHeld) return new Promise<never>(() => undefined);
        return done.has(options.requestId) ? completed() : { status: 'IN_PROGRESS' };
      },
      async result(endpoint, options) {
        log.push(`result ${options.requestId}`);
        if (endpoint !== FAL_EXTRACT_FRAME) {
          opts.onClipResult?.();
          // The clip's result read failing as `clipResultFails` says (fal's answer for a job it dropped, say), or held.
          if (opts.clipResultFails !== undefined) throw opts.clipResultFails;
          if (opts.clipResultHeld) return new Promise<never>(() => undefined);
        } else if (opts.frameResultFails !== undefined) throw opts.frameResultFails;
        else if (opts.frameResultHeld) return new Promise<never>(() => undefined);
        const data = endpoint === FAL_EXTRACT_FRAME ? { images: [{ url: 'https://v3.fal.media/files/last.png', content_type: 'image/png' }] } : { video: { url: 'https://v3.fal.media/files/clip.mp4', content_type: 'video/mp4' } };
        return { data, requestId: options.requestId };
      },
      async cancel(endpoint, options) {
        cancels.push({ endpoint, requestId: options.requestId, at: Date.now() });
        log.push(`cancel ${options.requestId}`);
        const answer = opts.cancel ?? { status: 'failed', detail: 'the fake has no cancel answer' };
        if (answer.status === 'completed' || opts.finishesAtCancel) done.add(options.requestId);
        return answer;
      },
    },
  };
  return { client, submitted, polls, cancels, log };
}

/** One turn of the real event loop (setImmediate is not faked): the gateway's file reads and writes get to finish. */
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * `p`, once it settles, with the fake clock moved on a tenth of a second at each real turn of the event loop meanwhile:
 * what follows a clip's answer (keeping it, writing its ledger entry under the ledger's lock) waits on files, and on the
 * ledger's timers when Windows answers a lock or a rename with a transient error. Nothing but its settling ends the wait:
 * a count of turns ran out on main's Windows run 40076504268 while the files were still being written, and the clock,
 * no longer moved, then held the call on a timer until the test timed out.
 */
async function settled<T>(p: Promise<T>): Promise<T> {
  let done = false;
  const out = p.finally(() => (done = true));
  while (!done) {
    await turn();
    await vi.advanceTimersByTimeAsync(100);
  }
  return out;
}

/**
 * Settles once `seen` holds, by real turns of the event loop only, the fake clock left where it is. Neither real time nor
 * a count of turns bounds it: under a loaded gate the gateway's files take as long as they take, and a `seen` that never
 * comes is stopped by vitest's hang guard.
 */
async function untilSeen(seen: () => boolean): Promise<void> {
  while (!seen()) await turn();
}

/** Settles once `fal` has been polled `n` times in all, the fake clock left where it is. */
const polled = (fal: { polls: unknown[] }, n: number): Promise<void> => untilSeen(() => fal.polls.length >= n);

/**
 * What `fal` was asked, in order, its status polls left out: a poll that a wait ended may still be tried again by the
 * retries, after it was given up (untilEnded), so where a poll falls among the rest says nothing.
 */
const asked = (fal: { log: string[] }): string[] => fal.log.filter((l) => !l.startsWith('poll '));

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
    // fal was asked once more, after the cancel, whether the job was done: it was not.
    expect(asked(fal)).toEqual(['cancel req-1', 'status req-1']);
  });

  it('a cancel that did not go through, the clip finished meanwhile: fal is asked once more, and the clip is kept and used', async () => {
    const fal = clipFal({ cancel: { status: 'failed', detail: 'no answer: fetch failed' }, finishesAtCancel: true, frameTakesMs: 0 });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const res = g.video(clipOf());
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    const clip = await settled(res);
    expect(clip.costUsd).toBeGreaterThan(0);
    expect(fal.cancels).toEqual([{ endpoint: BALANCED_VIDEO, requestId: 'req-1', at: T0 + 30 * MINUTE }]);
    expect(asked(fal).slice(0, 3)).toEqual(['cancel req-1', 'status req-1', 'result req-1']);
    expect(fal.submitted.map((s) => s.endpoint)).toEqual([BALANCED_VIDEO, FAL_EXTRACT_FRAME, FAL_EXTRACT_FRAME]);
    expect(ledger()).toEqual([expect.objectContaining({ provider: 'fal', kind: 'video', costUsd: clip.costUsd })]);
    expect((await g.spendRecords('ws')).uncertain).toEqual([]);
  });

  // R-MONEY-2, Block 2's re-check: the look after a failed cancel had no bound of byway's own (only the read's retries and
  // Node's fetch limits, minutes), and no stop ended it.
  const failedCancel = 'byway’s cancel did not go through (no answer: fetch failed)';

  it(`a cancel that did not go through, then a status that never answers: fal is asked once more for at most ${STATUS_BOUND_MS / 1000} seconds, and the call ends as may have been billed`, async () => {
    const fal = clipFal({ cancel: { status: 'failed', detail: 'no answer: fetch failed' }, statusHeld: true });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const err = failure(g.video(clipOf()));
    let over = false;
    void err.finally(() => (over = true));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    await untilSeen(() => fal.log.includes('status req-1'));
    await vi.advanceTimersByTimeAsync(STATUS_BOUND_MS - 1);
    for (let i = 0; i < 200; i++) await turn();
    expect(over).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    // Over at its bound: real turns only, the fake clock not moved on.
    await untilSeen(() => over);
    expect(Date.now()).toBe(T0 + 30 * MINUTE + STATUS_BOUND_MS);
    expect(await err).toMatchObject({ billing: 'maybe', message: lateClip(BALANCED_VIDEO, 'req-1', 30, failedCancel, true), waited: { minutes: 30, how: 'clip', cancel: failedCancel } });
    expect(asked(fal)).toEqual(['cancel req-1', 'status req-1']);
    expect(fal.submitted.map((s) => s.endpoint)).toEqual([BALANCED_VIDEO]);
    expect(ledger()).toEqual([]);
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ reason: 'waited', providerJobs: { generation: 'req-1' } })]);
  });

  it('a stop while fal is asked once more after a cancel that did not go through ends that look at once: may have been billed, as the failed cancel left it', async () => {
    const stop = new AbortController();
    const until = new AbortController();
    const fal = clipFal({ cancel: { status: 'failed', detail: 'no answer: fetch failed' }, statusHeld: true });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const err = failure(g.video(clipOf({ operation: { key: 'run-1/clip/video/abc/1', until: until.signal, stop: stop.signal } })));
    let over = false;
    void err.finally(() => (over = true));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    await untilSeen(() => fal.log.includes('status req-1'));
    stop.abort();
    // Over with the fake clock where it was: the stop ended the look, not its bound.
    await untilSeen(() => over);
    expect(Date.now()).toBe(T0 + 30 * MINUTE);
    // The look's bound ended with it (seenDone's bound.end): no timer of the call is left waiting to fire (B-073 (7)).
    expect(vi.getTimerCount()).toBe(0);
    expect(await err).toMatchObject({ billing: 'maybe', message: lateClip(BALANCED_VIDEO, 'req-1', 30, failedCancel, true), waited: { minutes: 30, how: 'clip', cancel: failedCancel } });
    expect(asked(fal)).toEqual(['cancel req-1', 'status req-1']);
    expect(fal.submitted.map((s) => s.endpoint)).toEqual([BALANCED_VIDEO]);
    expect(ledger()).toEqual([]);
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ reason: 'waited', providerJobs: { generation: 'req-1' } })]);
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
    // The last frame took a minute of the frame's bound, so the middle frame (F10 (a)) had a minute left, which ran out
    // as it was made: cancelled, best effort, and the clip is used without it.
    expect(fal.cancels).toEqual([
      { endpoint: BALANCED_VIDEO, requestId: 'req-1', at: T0 + 30 * MINUTE },
      { endpoint: FAL_EXTRACT_FRAME, requestId: 'req-3', at: T0 + 32 * MINUTE },
    ]);
    expect(fal.submitted.map((s) => s.endpoint)).toEqual([BALANCED_VIDEO, FAL_EXTRACT_FRAME, FAL_EXTRACT_FRAME]);
    expect(clip.middleFrameArtifactId).toBeUndefined();
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

  // MONEY-2, Block 2's check: a job resumed after its wait had passed was cancelled before its status came back (its
  // deadline was a timer of no time, which beats any round trip), so a clip fal had finished and billed was thrown away
  // when that one cancel failed, in words saying it did not finish.
  /** An earlier attempt of the step whose clip job fal accepted at T0, its worker gone; then the clock at `minutes`. */
  async function acceptedEarlier(key: string, minutes: number): Promise<void> {
    await book.admit({ opId: 'earlier', owner: 'gone', leaseMs: 60_000, operationKey: key, workspaceId: 'ws', runId: 'run-1', stepId: 'clip', purpose: 'relay:media', kind: 'video', provider: 'fal', model: BALANCED_VIDEO, reserveUsd: 0.5, paid: true, caps: { workspaceUsd: 100, runUsd: 50 } });
    await book.markSent('earlier', 'gone');
    await book.accept('earlier', 'generation', 'req-earlier');
    await vi.advanceTimersByTimeAsync(minutes * MINUTE);
  }

  it('a job resumed after its wait has passed is asked about once first: one fal finished is read and kept, never cancelled, though its status takes a round trip', async () => {
    const key = 'run-1/clip/video/abc/1';
    await acceptedEarlier(key, 45);
    // fal finished the clip; a cancel would not have gone through.
    const fal = clipFal({ done: ['req-earlier'], statusTakesMs: 50, frameTakesMs: 0, cancel: { status: 'failed', detail: 'no answer: fetch failed' } });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const until = new AbortController();
    const clip = await settled(g.video(clipOf({ operation: { key, until: until.signal } })));
    expect(clip.costUsd).toBeGreaterThan(0);
    expect(fal.log.slice(0, 2)).toEqual(['status req-earlier', 'result req-earlier']);
    expect(fal.log).not.toContain('poll req-earlier');
    expect(fal.cancels).toEqual([]);
    // Polled by its id, never submitted again: only its last and middle frames' jobs are.
    expect(fal.submitted.map((s) => s.endpoint)).toEqual([FAL_EXTRACT_FRAME, FAL_EXTRACT_FRAME]);
    expect(ledger()).toEqual([expect.objectContaining({ provider: 'fal', kind: 'video', costUsd: clip.costUsd })]);
    expect((await g.spendRecords('ws')).uncertain).toEqual([]);
  });

  it.each([
    ['still at work on it', {}],
    ['whose status cannot be read', { statusFails: new Error('fetch failed') }],
  ] as const)('a job resumed after its wait has passed, fal %s, is cancelled then, with no wait more, and counted by the cancel’s answer', async (_what, over) => {
    const key = 'run-1/clip/video/abc/1';
    await acceptedEarlier(key, 45);
    const fal = clipFal({ ...over, cancel: { status: 'requested', detail: 'HTTP 202 CANCELLATION_REQUESTED' } });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const until = new AbortController();
    const err = failure(g.video(clipOf({ operation: { key, until: until.signal } })));
    // Cancelled with the clock where it was: nothing waited more.
    await untilSeen(() => fal.cancels.length > 0);
    expect(fal.cancels).toEqual([{ endpoint: BALANCED_VIDEO, requestId: 'req-earlier', at: T0 + 45 * MINUTE }]);
    const e = await settled(err);
    expect(fal.log[0]).toBe('status req-earlier');
    expect(fal.log.at(-1)).toBe('cancel req-earlier');
    expect(fal.log).not.toContain('poll req-earlier');
    expect(e).toMatchObject({ billing: 'maybe', waited: { minutes: 30, how: 'clip' }, message: expect.stringContaining('clip job req-earlier within 30 minutes') });
    expect(fal.submitted).toEqual([]);
  });

  // R-MONEY-2, Block 2's re-check: that one status read had no bound of byway's own (only its retries and Node's fetch
  // limits, minutes), so a hung read held the job uncancelled for as long.
  it(`a job resumed after its wait has passed whose status never answers is cancelled ${STATUS_BOUND_MS / 1000} seconds on, not later: an unread status shows nothing done`, async () => {
    const key = 'run-1/clip/video/abc/1';
    await acceptedEarlier(key, 45);
    const fal = clipFal({ statusHeld: true, cancel: { status: 'requested', detail: 'HTTP 202 CANCELLATION_REQUESTED' } });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const until = new AbortController();
    const err = failure(g.video(clipOf({ operation: { key, until: until.signal } })));
    await untilSeen(() => fal.log.includes('status req-earlier'));
    await vi.advanceTimersByTimeAsync(STATUS_BOUND_MS - 1);
    for (let i = 0; i < 200; i++) await turn();
    expect(fal.cancels).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    // Cancelled at its bound: real turns only, the fake clock not moved on.
    await untilSeen(() => fal.cancels.length > 0);
    expect(fal.cancels).toEqual([{ endpoint: BALANCED_VIDEO, requestId: 'req-earlier', at: T0 + 45 * MINUTE + STATUS_BOUND_MS }]);
    const e = await settled(err);
    expect(asked(fal)).toEqual(['status req-earlier', 'cancel req-earlier']);
    expect(fal.log).not.toContain('poll req-earlier');
    expect(e).toMatchObject({ billing: 'maybe', waited: { minutes: 30, how: 'clip' }, message: expect.stringContaining('clip job req-earlier within 30 minutes') });
    expect(fal.submitted).toEqual([]);
  });

  it('a stop while fal is asked about a job resumed after its wait is a stop, not a wait that ran out: cancelled, and counted as interrupted', async () => {
    const key = 'run-1/clip/video/abc/1';
    await acceptedEarlier(key, 45);
    const fal = clipFal({ done: ['req-earlier'], statusTakesMs: 50, cancel: { status: 'requested', detail: 'HTTP 202 CANCELLATION_REQUESTED' } });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const until = new AbortController();
    const stop = new AbortController();
    const err = failure(g.video(clipOf({ operation: { key, until: until.signal, stop: stop.signal } })));
    await untilSeen(() => fal.log.includes('status req-earlier'));
    stop.abort();
    const e = await settled(err);
    expect(asked(fal)).toEqual(['status req-earlier', 'cancel req-earlier']);
    expect(e).toMatchObject({ billing: 'maybe', cutOff: true });
    expect(e).not.toHaveProperty('waited');
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ reason: 'interrupted', providerJobs: { generation: 'req-earlier' } })]);
  });
});

// B-073 (5): which of the two ended a wait decides only the reason Spending records give (waited or stopped), so the order
// is pinned here, where it is decided.
describe('a wait that its stop and its deadline have both already ended', () => {
  it('is a stop: the stop is looked at first', async () => {
    const never = new Promise<never>(() => undefined);
    expect(await untilEnded(never, AbortSignal.abort(), AbortSignal.abort())).toBe(STOPPED);
    expect(await untilEnded(never, new AbortController().signal, AbortSignal.abort())).toBe(WAITED);
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
    expect(fal.submitted.map(({ at: _at, ...job }) => job)).toEqual([{ endpoint: model, startTimeoutSeconds: minutes * 60 }, { endpoint: FAL_EXTRACT_FRAME }, { endpoint: FAL_EXTRACT_FRAME }]);
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

/**
 * A clip job fal dropped at the start deadline byway sent with it: fal answers its result with 504 and
 * `X-Fal-Request-Timeout-Type: user` (fal's queue page, read 2026-10-22), which @fal-ai/client 1.10.1 hands on as an
 * ApiError whose status is 504 and timeoutType "user". fal's pricing page (read 2026-10-22): "If a request fails with an
 * HTTP 500 or higher status code, no charge is incurred." So nothing was billed, and the step says so.
 */
describe('a clip job fal dropped at its start deadline (504, timeout type "user"): nothing was billed, and the step says so', () => {
  const dropped = () => new ApiError({ message: 'Gateway Timeout', status: 504, body: { detail: 'Request timed out' }, timeoutType: 'user' });
  const notStarted = (model: string, minutes: number, start: number) =>
    `fal.ai’s model ${model} did not start clip job req-1 in time to finish within ${minutes} minutes, the wait chosen in Settings, so fal dropped it at the start deadline byway set (${start} minutes) and nothing was billed. ${TAIL}`;

  it.each([
    ['balanced', BALANCED_VIDEO, 5, undefined, 25],
    ['balanced', BALANCED_VIDEO, 10, 45, 35],
    ['best', BEST_VIDEO, 15, 75, 60],
  ] as const)('%s (%s): a %s-second clip at a %s-minute wait (none chosen: 30), dropped at %s minutes, is released counting nothing, never cancelled or sent again', async (profileId, model, seconds, chosen, start) => {
    const minutes = chosen ?? 30;
    // fal reports the job done at its start deadline, and its result is the 504.
    const fal = clipFal({ clipTakesMs: start * MINUTE, clipResultFails: dropped() });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch, caps: waitsOf({ [`fal/${model}`]: chosen }).caps });
    const call = failure(g.video(clipOf({ profileId, durationSec: seconds })));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(start * MINUTE);
    const e = await settled(call);
    expect(fal.submitted.map(({ at: _at, ...job }) => job)).toEqual([{ endpoint: model, startTimeoutSeconds: start * 60 }]);
    expect(e).toMatchObject({ code: 'provider-error', retryable: false, billing: 'none', billed: false, message: notStarted(model, minutes, start) });
    expect(e).not.toHaveProperty('waited');
    // Not cancelled (fal dropped it), no frame job, nothing ledgered, nothing counted or listed.
    expect(fal.cancels).toEqual([]);
    expect(ledger()).toEqual([]);
    expect(await g.spendRecords('ws')).toMatchObject({ inFlight: [], uncertain: [] });
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0, inFlightUsd: 0, uncertainUsd: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a 504 that is not fal’s start deadline (no timeout type: a proxy’s answer) is read as before: the clip may still be made and billed, and is listed with its job', async () => {
    const fal = clipFal({ clipTakesMs: MINUTE, clipResultFails: new ApiError({ message: 'Gateway Timeout', status: 504 }) });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const call = failure(g.video(clipOf()));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(MINUTE);
    const e = await settled(call);
    expect(e.message).toMatch(/^fal accepted the clip \(request req-1\), but its result could not be read: .*fal may still make it and bill it; byway did not submit it again\.$/);
    expect(e).toMatchObject({ retryable: false });
    expect(fal.submitted).toHaveLength(1);
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ provider: 'fal', providerJobs: { generation: 'req-1' } })]);
  });

  // TESTS-1, Block 2's check: a stop that came while the dropped job's result was read, or while it was polled with fal
  // then answering its cancel "already completed", settled it through the made-and-billed path: the ledger counted a clip
  // fal says it never ran and never billed.
  it.each([
    ['while its result is read', { clipTakesMs: 25 * MINUTE }, undefined, 25 * MINUTE, []],
    ['while it is polled, its cancel answered “already completed”', {}, { status: 'completed', detail: 'HTTP 400 ALREADY_COMPLETED' }, MINUTE, ['req-1']],
  ] as const)('a stop arriving %s is no reason to count it: fal’s word that it never ran is taken, and nothing is ledgered', async (_what, over, cancel, stopAtMs, cancelled) => {
    const stop = new AbortController();
    const until = new AbortController();
    const fal = clipFal({ ...over, ...(cancel ? { cancel } : {}), clipResultFails: dropped(), onClipResult: stopAtMs === 25 * MINUTE ? () => stop.abort() : undefined });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const call = failure(g.video(clipOf({ operation: { key: 'run-1/clip/video/abc/1', until: until.signal, stop: stop.signal } })));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(stopAtMs);
    stop.abort();
    const e = await settled(call);
    expect(e).toMatchObject({ code: 'provider-error', retryable: false, billing: 'none', billed: false, message: notStarted(BALANCED_VIDEO, 30, 25) });
    expect(e).not.toHaveProperty('cutOff');
    expect(fal.cancels.map((c) => c.requestId)).toEqual(cancelled);
    expect(fal.submitted.map((s) => s.endpoint)).toEqual([BALANCED_VIDEO]);
    expect(ledger()).toEqual([]);
    expect(await g.spendRecords('ws')).toMatchObject({ inFlight: [], uncertain: [] });
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0, inFlightUsd: 0, uncertainUsd: 0 });
  });

  it(`a stop while a clip fal finished is read: its result is read once more, for at most ${LOOK_BOUND_MS / 1000} seconds, then it is settled as made`, async () => {
    const stop = new AbortController();
    const until = new AbortController();
    const fal = clipFal({ clipTakesMs: MINUTE, clipResultHeld: true, onClipResult: () => stop.abort() });
    const fetch = fakeFetch();
    const g = gateway({ clients: { fal: fal.client }, fetch: fetch.fetch });
    const call = failure(g.video(clipOf({ operation: { key: 'run-1/clip/video/abc/1', until: until.signal, stop: stop.signal } })));
    let over = false;
    void call.finally(() => (over = true));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(MINUTE);
    await untilSeen(() => fal.log.filter((l) => l === 'result req-1').length >= 2);
    expect(fal.log.filter((l) => l === 'result req-1')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(LOOK_BOUND_MS - 1);
    for (let i = 0; i < 200; i++) await turn();
    expect(over).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const e = await settled(call);
    expect(e).toMatchObject({ code: 'byway-failure', billed: true, message: 'fal made the clip and billed it (its cost is recorded), but its run was ending, so byway did not download it.' });
    expect(fal.cancels).toEqual([]);
    expect(fetch.requested).toEqual([]);
    // Over at its bound, not only after it (R-MONEY-3, Block 2's re-check: settled() moves the clock on until the call is over, so
    // a look of two minutes passed too). The gateway reads the clock as the adapter answers (the entry's latencyMs, from
    // the call's start at T0): the clip was done a minute in, so its answer came LOOK_BOUND_MS later, to the
    // millisecond. That reading comes before the files that follow, whose lock waits are timers too, so it holds however
    // far settled() then moves the clock; waiting by real turns alone would hang on a lock Windows keeps busy.
    expect(ledger()).toEqual([expect.objectContaining({ provider: 'fal', kind: 'video', latencyMs: MINUTE + LOOK_BOUND_MS })]);
  });
});

/**
 * A stopped clip fal reported done (its status, or its cancel's "already completed") whose result fal answers with its
 * own failure: an HTTP status with fal's JSON body, as @fal-ai/client 1.10.1 hands on an answer that is not a success (an
 * ApiError; a ValidationError for 422). fal's pricing page (read 2026-10-22): "If a request fails with an HTTP 500 or
 * higher status code, no charge is incurred"; its FAQ says a 422 may still be charged. So it may have been billed, and
 * is counted so, at its estimate, as the same answer is without a stop; it is never ledgered as made. A lost connection,
 * or a page with no body of fal's (a proxy's), is no word from fal on the job, so the clip is settled as made, as before.
 */
describe('a stopped clip fal reported done, whose result fal answers with a failure: may have been billed, never ledgered as made', () => {
  // R-MONEY-1, Block 2's re-check: the stopped clip's one result read took only fal's start-deadline 504, and settled a
  // clip as made, ledgered at its price, when fal answered its result with any other failure of its own.
  const fals = {
    'a 500 with fal’s body': () => new ApiError({ message: 'Internal Server Error', status: 500, body: { detail: 'The model failed to generate the video' } }),
    'a 422 (a ValidationError)': () => new ValidationError({ message: 'Unprocessable Entity', status: 422, body: { detail: 'The model failed to generate the video' } }),
    'a 400 with fal’s body': () => new ApiError({ message: 'Bad Request', status: 400, body: { detail: 'bad_request' } }),
  };
  // R2-MONEY-1, Block 2's second re-check: any status with a body counted, so fal's answers about the read rather than
  // the job (its limits, its gateway, the key) counted a clip fal made and billed as may have been billed. A body that is
  // not fal's JSON error, with its `detail`, is no word from fal either.
  const notFals = {
    'a lost connection (no status)': () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) }),
    'a 500 with no body of fal’s (a proxy’s page)': () => new ApiError({ message: 'HTTP 500: Internal Server Error', status: 500 }),
    'a 500 whose body is text, not fal’s JSON': () => new ApiError({ message: 'Internal Server Error', status: 500, body: 'upstream connect error' }),
    'a 500 whose body has no detail': () => new ApiError({ message: 'Internal Server Error', status: 500, body: { error: 'oops' } }),
    ...Object.fromEntries(
      [408, 429, 502, 503, 504, 401, 403].map((status) => [`a ${status} with fal’s body (about the read, not the job)`, () => new ApiError({ message: `HTTP ${status}`, status, body: { detail: 'Try again later' } })]),
    ),
    // fal's body is its JSON object; a body of text is not its word on the job (B-073 (6): falFailure reads its shape).
    'a 500 whose body is text, not fal’s JSON object': () => new ApiError({ message: 'HTTP 500: Internal Server Error', status: 500, body: '<html>Bad gateway</html>' }),
  };
  const routes = {
    'the status said done, then a stop came while its result was read': 'read',
    'a stop came while it was polled, and fal answered its cancel “already completed”': 'poll',
  } as const;
  const cases = <T extends Record<string, () => unknown>>(answers: T) => Object.entries(routes).flatMap(([what, route]) => Object.entries(answers).map(([answer, fails]) => [what, answer, route, fails] as const));

  /** The call on `route` with its clip's result failing as `fails` says: its error, its gateway, and what fal was asked. */
  async function stoppedDone(route: 'read' | 'poll', fails: () => unknown) {
    const stop = new AbortController();
    const until = new AbortController();
    const fal = clipFal({ ...(route === 'read' ? { clipTakesMs: MINUTE, onClipResult: () => stop.abort() } : { cancel: { status: 'completed', detail: 'HTTP 400 ALREADY_COMPLETED' } }), clipResultFails: fails() });
    const media = fakeFetch();
    const g = gateway({ clients: { fal: fal.client }, fetch: media.fetch });
    const call = failure(g.video(clipOf({ operation: { key: 'run-1/clip/video/abc/1', until: until.signal, stop: stop.signal } })));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(MINUTE);
    stop.abort();
    const e = await settled(call);
    // Read once more after the stop, never sent again, nothing downloaded.
    expect(asked(fal)).toEqual(route === 'read' ? ['result req-1', 'result req-1'] : ['cancel req-1', 'result req-1']);
    expect(fal.submitted.map((s) => s.endpoint)).toEqual([BALANCED_VIDEO]);
    expect(media.requested).toEqual([]);
    return { e, g };
  }

  it.each(cases(fals))('%s, its result answered with %s: counted as may have been billed, at its estimate, with its job; nothing ledgered', async (_what, _answer, route, fails) => {
    const { e, g } = await stoppedDone(route, fails);
    const status = (fails() as { status: number }).status;
    expect(e).toMatchObject({
      code: 'byway-failure',
      retryable: false,
      billing: 'maybe',
      cutOff: true,
      message: `byway cut off this fal call because its run was ending (fal reported clip job req-1 done, but answered its result with a failure, HTTP ${status}). fal may have billed the work it did, so the call is counted at its estimate, as "may have been billed", and listed in Settings under Spending records until you clear it.`,
    });
    expect(e.billed).toBeUndefined();
    expect(ledger()).toEqual([]);
    expect((await g.spendRecords('ws')).uncertain.map((u) => [u.reason, u.usd, u.providerJobs])).toEqual([['interrupted', 0.354, { generation: 'req-1' }]]);
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0, byRun: {}, inFlightUsd: 0, uncertainUsd: 0.354 });
  });

  it.each(cases(notFals))('%s, its result answered with %s: no word from fal on the job, so it is settled as made, as before', async (_what, _answer, route, fails) => {
    const { e, g } = await stoppedDone(route, fails);
    expect(e).toMatchObject({ code: 'byway-failure', billed: true, message: 'fal made the clip and billed it (its cost is recorded), but its run was ending, so byway did not download it.' });
    expect(ledger()).toEqual([expect.objectContaining({ provider: 'fal', kind: 'video', costUsd: 0.354 })]);
    expect((await g.spendRecords('ws')).uncertain).toEqual([]);
  });
});

describe('fal’s own failure answer with no stop (the parity the stopped look leans on, ADR-0114 item 12)', () => {
  it('a 500 with fal’s body on the clip’s result: accepted but unread, counted as may have been billed (failed), nothing ledgered', async () => {
    const fal = clipFal({ clipTakesMs: MINUTE, clipResultFails: new ApiError({ message: 'Internal Server Error', status: 500, body: { detail: 'The model failed to generate the video' } }) });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const call = failure(g.video(clipOf()));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(MINUTE);
    const e = await settled(call);
    expect(e.message).toMatch(/^fal accepted the clip \(request req-1\), but its result could not be read: .*fal may still make it and bill it; byway did not submit it again\.$/);
    expect(e).toMatchObject({ retryable: false });
    expect(fal.cancels).toEqual([]);
    expect(ledger()).toEqual([]);
    expect((await g.spendRecords('ws')).uncertain.map((u) => [u.reason, u.providerJobs])).toEqual([['failed', { generation: 'req-1' }]]);
  });
});

describe('the last-frame job is sent no start deadline, and its 504 is not read as never started (B-025)', () => {
  it('a 504 with timeout type "user" on the frame’s result: the clip is kept and ledgered, the frame could not be read', async () => {
    const fal = clipFal({ clipTakesMs: MINUTE, frameTakesMs: MINUTE, frameResultFails: new ApiError({ message: 'Gateway Timeout', status: 504, body: { detail: 'Request timed out' }, timeoutType: 'user' }) });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const call = failure(g.video(clipOf()));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(MINUTE);
    await polled(fal, 2);
    await vi.advanceTimersByTimeAsync(MINUTE);
    const e = await settled(call);
    expect(fal.submitted.map(({ at: _at, ...job }) => job)).toEqual([{ endpoint: BALANCED_VIDEO, startTimeoutSeconds: expect.any(Number) }, { endpoint: FAL_EXTRACT_FRAME }]);
    expect(e).toMatchObject({ billed: true });
    expect(e.message).toMatch(/^fal made the clip and billed it, but its last frame could not be extracted \(the clip is kept as sha256:[0-9a-f]{64}\): .*req-2/);
    expect(ledger()).toEqual([expect.objectContaining({ provider: 'fal', kind: 'video' })]);
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

  // TESTS-4, Block 2's check: nothing showed the frame job's result read stops at the bound; the fake answered it at once.
  it('the frame job’s result read is bounded too: a frame job done in a minute whose result never comes is given up at the bound, and the clip kept', async () => {
    const fal = clipFal({ clipTakesMs: 28 * MINUTE, frameTakesMs: MINUTE, frameResultHeld: true });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const err = failure(g.video(clipOf()));
    let over = false;
    void err.finally(() => (over = true));
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(28 * MINUTE);
    await polled(fal, 2);
    const frameFrom = Date.now();
    await vi.advanceTimersByTimeAsync(MINUTE);
    await untilSeen(() => fal.log.includes('result req-2'));
    // 2 minutes left on the clip's wait and 2 more: 4 minutes from the frame job's start, 3 of them left now.
    await vi.advanceTimersByTimeAsync(3 * MINUTE - 1);
    for (let i = 0; i < 200; i++) await turn();
    expect(over).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    // Given up then: it ends once its clip is ledgered and kept (files and timers), not on fal's answer.
    const e = await settled(err);
    expect(e).toMatchObject({ billed: true });
    expect(e.message).toMatch(/: last-frame job req-2 did not finish within the time left on the clip’s wait plus 2 minutes, so byway stopped waiting$/);
    // Done when its bound ran out, so not cancelled; the clip is ledgered and kept. Given up at the bound, not only after
    // it (R-MONEY-3, Block 2's re-check: settled() moves the clock until the call is over, so a read bounded apart
    // from the frame's, and longer, passed too): the gateway read the clock as the adapter answered (the entry's
    // latencyMs, from the call's start at T0), 4 minutes from the frame job's start to the millisecond. That reading
    // comes before the files that follow, whose lock waits are timers too, so the loop's steps do not move it.
    expect(fal.cancels).toEqual([]);
    expect(ledger()).toEqual([expect.objectContaining({ provider: 'fal', kind: 'video', latencyMs: frameFrom + 4 * MINUTE - T0 })]);
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
    await untilSeen(() => frames.length > 0);
    expect(frames).toHaveLength(1);
    // 2 minutes left on the clip's wait and 2 more: 4 minutes from the frame job's start, 3 of them left now.
    await vi.advanceTimersByTimeAsync(3 * MINUTE - 1);
    expect(frames[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await settled(err)).message).toMatch(/the last frame’s download did not finish within the time left on the clip’s wait plus 2 minutes, so byway stopped waiting$/);
    expect(ledger()).toEqual([expect.objectContaining({ provider: 'fal', kind: 'video' })]);
  });
});
