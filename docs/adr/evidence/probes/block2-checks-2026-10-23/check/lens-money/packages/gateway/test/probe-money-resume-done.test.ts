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
import { FAL_EXTRACT_FRAME, FAL_START_TIMEOUT_HEADERS, falStartTimeoutSeconds, FRAME_GRACE_MS, submitJob, type FalCancel, type FalClientLike } from '../src/providers/fal.ts';
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
 * (undefined: they never finish), each poll ending as the SDK's does once its signal aborts. A cancel answers `cancel`;
 * one that says the job was already done leaves it done. The clip's result read throws `clipResultFails` when given.
 * Every submission, poll and cancel is kept, with the clock.
 */
function clipFal(opts: { clipTakesMs?: number; frameTakesMs?: number; cancel?: FalCancel; clipResultFails?: unknown } = {}) {
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
        // The clip's result read failing as `clipResultFails` says (fal's answer for a job it dropped, say).
        if (endpoint !== FAL_EXTRACT_FRAME && opts.clipResultFails !== undefined) throw opts.clipResultFails;
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


describe('PROBE money: a resumed clip that fal had finished, after its wait has passed', () => {
  for (const cancel of [{ status: 'completed', detail: 'HTTP 400 ALREADY_COMPLETED' }, { status: 'failed', detail: 'no answer: fetch failed' }] as FalCancel[]) {
    it(`cancel answers ${cancel.status}`, async () => {
      const key = 'run-1/clip/video/abc/1';
      await book.admit({ opId: 'earlier', owner: 'gone', leaseMs: 60_000, operationKey: key, workspaceId: 'ws', runId: 'run-1', stepId: 'clip', purpose: 'relay:media', kind: 'video', provider: 'fal', model: BALANCED_VIDEO, reserveUsd: 0.5, paid: true, caps: { workspaceUsd: 100, runUsd: 50 } });
      await book.markSent('earlier', 'gone');
      await book.accept('earlier', 'generation', 'req-earlier');
      // The earlier attempt's clip finished at minute 29; the step timed out while downloading it; the retry starts at 45.
      await vi.advanceTimersByTimeAsync(45 * MINUTE);
      const base = clipFal({ cancel, frameTakesMs: 1000 });
      const order: string[] = [];
      const client: FalClientLike = {
        ...base.client,
        queue: {
          ...base.client.queue,
          // A real status poll is a network round trip: it answers COMPLETED after 50 ms.
          subscribeToStatus: (endpoint, options) => {
            order.push(`status ${options.requestId}`);
            if (endpoint === FAL_EXTRACT_FRAME) return base.client.queue.subscribeToStatus(endpoint, options);
            return new Promise((resolve) => setTimeout(() => resolve({ status: 'COMPLETED' }), 50));
          },
          cancel: async (endpoint, options) => {
            order.push(`cancel ${options.requestId}`);
            return base.client.queue.cancel(endpoint, options);
          },
        },
      };
      const g = gateway({ clients: { fal: client }, fetch: fakeFetch().fetch });
      const until = new AbortController();
      const out = await settled(g.video(clipOf({ operation: { key, until: until.signal } })).then((r) => ({ ok: r.costUsd }), (e: unknown) => ({ err: (e as Error).message })));
      console.log('PROBE', cancel.status, JSON.stringify(out), JSON.stringify(order), JSON.stringify((await g.spendRecords('ws')).uncertain.map((u) => [u.reason, u.usd])));
    });
  }
});
