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
import { ApiError } from '@fal-ai/client';
import { GatewayError, type VideoRequest } from '@byway/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGateway, type GatewayOptions, type ModelGateway } from '../src/gateway.ts';
import { MemorySpendBook } from '../src/memory-book.ts';
import { encodePng } from '../src/mock/png.ts';
import { FAL_EXTRACT_FRAME, FAL_START_TIMEOUT_HEADERS, falStartTimeoutSeconds, FRAME_GRACE_MS, RESULT_LOOK_MS, submitJob, type FalCancel, type FalClientLike } from '../src/providers/fal.ts';
import { fakeFetch, MemoryArtifacts } from './fakes.ts';

const KEYS = { FAL_KEY: '[redacted]' };
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
 * (undefined: they never finish), each poll ending as the SDK's does once its signal aborts. Jobs in `done` are done from
 * the start. A status read of a done job, polled or read once (`status`), answers after `statusTakesMs` when given, as a
 * real round trip does, else at once; `statusFails` makes every one-shot status read throw it. A cancel answers `cancel`;
 * one that says the job was already done leaves it done, and with `finishesAtCancel` the job finishes just as the cancel
 * is sent, whatever it answers. The clip's result read calls `onClipResult` first (a stop arriving while it is under
 * way, say), then throws `clipResultFails` when given, or with `clipResultHeld` never answers; with `frameResultHeld`,
 * the frame job's result read never answers. Every submission, poll and cancel is kept, with the clock, and `log` keeps
 * every status read, poll, result read and cancel in order.
 */
function clipFal(
  opts: {
    clipTakesMs?: number;
    frameTakesMs?: number;
    cancel?: FalCancel;
    clipResultFails?: unknown;
    clipResultHeld?: boolean;
    frameResultHeld?: boolean;
    onClipResult?: () => void;
    done?: string[];
    statusTakesMs?: number;
    statusFails?: unknown;
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
        return done.has(options.requestId) ? completed() : { status: 'IN_PROGRESS' };
      },
      async result(endpoint, options) {
        log.push(`result ${options.requestId}`);
        if (endpoint !== FAL_EXTRACT_FRAME) {
          opts.onClipResult?.();
          // The clip's result read failing as `clipResultFails` says (fal's answer for a job it dropped, say), or held.
          if (opts.clipResultFails !== undefined) throw opts.clipResultFails;
          if (opts.clipResultHeld) return new Promise<never>(() => undefined);
        } else if (opts.frameResultHeld) return new Promise<never>(() => undefined);
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

/**
 * What `fal` was asked, in order, its status polls left out: a poll that a wait ended may still be tried again by the
 * retries, after it was given up (untilEnded), so where a poll falls among the rest says nothing.
 */
const asked = (fal: { log: string[] }): string[] => fal.log.filter((l) => !l.startsWith('poll '));

const TAIL = "To wait longer, change 'How long to wait for an answer' in Settings.";
const lateClip = (model: string, job: string, minutes: number, cancel: string, billed: boolean) =>
  `fal.ai’s model ${model} did not finish clip job ${job} within ${minutes} minutes, the wait chosen in Settings, so byway stopped waiting and cancelled it: ${cancel}. ${billed ? 'It may have billed the work. ' : ''}${TAIL}`;


describe('r-money probes', () => {
  const failed500 = () => new ApiError({ message: 'Internal Server Error', status: 500, body: { detail: 'The model failed to generate the video' } });
  const dropped = () => new ApiError({ message: 'Gateway Timeout', status: 504, body: { detail: 'Request timed out' }, timeoutType: 'user' });
  const out: string[] = [];
  afterEach(() => {});
  it.each([
    ['a: stop during poll, cancel ALREADY_COMPLETED, result 500 with fal body', true, failed500],
    ['b: no stop, job done, result 500 with fal body', false, failed500],
  ] as const)('%s', async (what, withStop, fails) => {
    const stop = new AbortController();
    const until = new AbortController();
    const fal = clipFal({ ...(withStop ? {} : { clipTakesMs: MINUTE }), cancel: { status: 'completed', detail: 'HTTP 400 ALREADY_COMPLETED' }, clipResultFails: fails() });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const call = g.video(clipOf({ operation: { key: 'run-1/clip/video/abc/1', until: until.signal, ...(withStop ? { stop: stop.signal } : {}) } })).then(() => 'ok', (e: any) => e);
    await polled(fal, 1);
    await vi.advanceTimersByTimeAsync(MINUTE);
    if (withStop) stop.abort();
    const e: any = await settled(call);
    const rec = await g.spendRecords('ws');
    const line = `${what}\n   error: billing=${e?.billing} billed=${e?.billed} code=${e?.code}: ${String(e?.message).slice(0, 220)}\n   ledger=${JSON.stringify(ledger().map((l) => l.costUsd))} spend=${JSON.stringify(await g.spend('ws'))}\n   uncertain=${JSON.stringify(rec.uncertain.map((u) => [u.reason, u.usd]))} asked=${JSON.stringify(asked(fal))}`;
    require('node:fs').appendFileSync('C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/rm-probe.log', line + '\n');
  });

  async function acceptedEarlier(key: string, minutes: number): Promise<void> {
    await book.admit({ opId: 'earlier', owner: 'gone', leaseMs: 60_000, operationKey: key, workspaceId: 'ws', runId: 'run-1', stepId: 'clip', purpose: 'relay:media', kind: 'video', provider: 'fal', model: BALANCED_VIDEO, reserveUsd: 0.5, paid: true, caps: { workspaceUsd: 100, runUsd: 50 } });
    await book.markSent('earlier', 'gone');
    await book.accept('earlier', 'generation', 'req-earlier');
    await vi.advanceTimersByTimeAsync(minutes * MINUTE);
  }
  it.each([
    // c
    ['c: resumed past wait, fal reports done, result is the start-deadline 504', { done: ['req-earlier'] }],
    ['d: resumed past wait, still running, cancel fails, finished meanwhile, result is the start-deadline 504', { finishesAtCancel: true, cancel: { status: 'failed', detail: 'no answer: fetch failed' } as FalCancel }],
    ['e: resumed past wait, status read takes 12 minutes (a hung round trip)', { statusTakesMs: 12 * MINUTE }],
  ] as const)('%s', async (what, over) => {
    const key = 'run-1/clip/video/abc/1';
    await acceptedEarlier(key, 45);
    const fal = clipFal({ cancel: { status: 'requested', detail: 'HTTP 202 CANCELLATION_REQUESTED' }, clipResultFails: what.startsWith('e') ? undefined : dropped(), frameTakesMs: 0, ...over });
    // e: a status read of a job not yet done that takes a long round trip
    if (what.startsWith('e')) {
      const orig = fal.client.queue.status;
      fal.client.queue.status = (ep, o) => new Promise((resolve) => setTimeout(() => resolve(orig(ep, o)), 12 * MINUTE));
    }
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const until = new AbortController();
    const t0 = Date.now();
    const call = g.video(clipOf({ operation: { key, until: until.signal } })).then(() => 'ok', (e: any) => e);
    let ended = false; void call.finally(() => (ended = true));
    if (what.startsWith('e')) { for (let i = 0; i < 2000; i++) await turn(); await vi.advanceTimersByTimeAsync(12 * MINUTE - 1); for (let i = 0; i < 2000; i++) await turn(); require('node:fs').appendFileSync('C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/rm-probe.log', `e: at 12 min - 1 ms over=${ended} cancels=${fal.cancels.length}
`); await vi.advanceTimersByTimeAsync(1); }
    const e: any = await settled(call);
    const rec = await g.spendRecords('ws');
    const line = `${what}\n   error: billing=${e?.billing} code=${e?.code}: ${String(e?.message).slice(0, 200)}\n   ledger=${JSON.stringify(ledger().map((l) => l.costUsd))} uncertain=${JSON.stringify(rec.uncertain.map((u) => [u.reason, u.usd]))} asked=${JSON.stringify(asked(fal))} cancelAt+min=${JSON.stringify(fal.cancels.map((c) => (c.at - t0) / MINUTE))}`;
    require('node:fs').appendFileSync('C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/rm-probe.log', line + '\n');
  });
});
