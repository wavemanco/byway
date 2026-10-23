/**
 * Two Temporal attempts of one step's paid call (F03 stage 3; ADR-0099), with the real store, its spend book and the
 * real gateway, through the runner's memo layer as an activity uses it. Temporal starts attempt 2 when attempt 1 timed
 * out (its cancel is aborted with TIMED_OUT, about two seconds later in a live worker) or its worker died; attempt 1 may
 * still be running. The memo alone could not stop a second purchase: attempt 1 records its answer only after the call,
 * and a settled call's memo save can take tens of seconds. Now:
 * - attempt 1 blocked between settlement and its memo save: attempt 2 waits, and returns attempt 1's answer once kept;
 *   one provider call;
 * - attempt 1 hung in its provider call: attempt 2 takes the call over within one lease (the first counts as may have
 *   been billed), or, for a fal clip fal accepted, resumes it from its stored request ids, with no new submission;
 * - a holder that never lets go: attempt 2 gives up after its wait limit with a plain step failure, never pays again.
 * The provider is a stand-in; nothing leaves this computer.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GatewayError, type CompletionRequest, type SpendBook, type Store, type VideoRequest } from '@byway/contracts';
import { createGateway, falAdapter, type FalClientLike, type ModelGateway, type PriceRow, type ProviderAdapter } from '@byway/gateway';
import { PRICES } from '@byway/gateway';
import { StepError } from '../src/activities/failures.ts';
import { startInvocation } from '../src/activities/liveness.ts';
import { memoGateway, type MemoOptions } from '../src/activities/memo.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

const KEYS = { ANTHROPIC_API_KEY: 'sk-ant-api03-test-not-a-real-key-000000', FAL_KEY: '0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6:00112233445566778899aabbccddeeff' };
/** $100 per million output tokens: a 1,000-token answer is $0.10. */
const PRICED: PriceRow[] = [...PRICES, { provider: 'anthropic', model: 'overlap-model', inputPerMTok: 0, outputPerMTok: 100, source: 'overlap tests' }];
const LEASE = 60_000;
/** The memo layer's wait, quickened: memo polls and gateway re-calls every few milliseconds. */
const QUICK: MemoOptions = { waitPollMs: 5, recallEveryMs: 20 };

let dir: string;
let store: MemoStore;
let clock: { t: number };
let runId: string;
let workspaceId: string;
const gateways: ModelGateway[] = [];
/** Renewals the gateways made, so a test that moves the clock waits for the holder to have renewed after the move. */
let renewals = 0;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-overlap-'));
  clock = { t: Date.parse('2026-10-09T12:00:00.000Z') };
  renewals = 0;
  store = createTestStore({ dataDir: dir, now: () => new Date(clock.t) });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
  runId = (await store.createRun({ id: 'run-overlap', workspaceId, recipeId: 'tiny', recipeHash: 'sha256:x', profileId: 'balanced', title: 't', problem: 'p', medium: 'prose', budgetUsd: 5 })).id;
});
afterEach(async () => {
  for (const g of gateways.splice(0)) await g.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

/** One worker's gateway on the store's spend book; its holder renews every 10 ms. */
function gateway(adapters: Partial<Record<'anthropic', ProviderAdapter>> & { fal?: FalClientLike; fetch?: typeof fetch }): ModelGateway {
  const { fal, fetch: fetchImpl, ...rest } = adapters;
  const g = createGateway({
    ledgerPath: path.join(dir, 'ledger.jsonl'),
    artifacts: store.artifacts,
    spendBook: counted(store.spendBook),
    caps: { workspaceCapUsd: () => 10, runCapUsd: () => 10 },
    env: KEYS,
    prices: PRICED,
    adapters: rest,
    ...(fal ? { clients: { fal } } : {}),
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    retry: { sleep: async () => {}, random: () => 0.5 },
    renewEveryMs: 10,
  });
  gateways.push(g);
  return g;
}

/** The book, counting the renewals that reached it. */
function counted(book: SpendBook): SpendBook {
  return new Proxy(book, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target) as unknown;
      if (typeof v !== 'function') return v;
      if (prop !== 'renew') return v.bind(target);
      return async (...args: unknown[]) => {
        await (v as (...a: unknown[]) => Promise<void>).apply(target, args);
        renewals += 1;
      };
    },
  });
}

/** Moves the clock, then waits for two renewals: the second certainly started after the move. */
async function advance(ms: number): Promise<void> {
  clock.t += ms;
  const seen = renewals;
  await until(() => renewals >= seen + 2);
}

/** One attempt of the step: its invocation (done, as the activity wrapper ends it) and Temporal's cancel of it. */
function attempt() {
  const cancel = new AbortController();
  const invocation = startInvocation();
  return { cancel, invocation, operation: { until: invocation.done, cancel: cancel.signal } };
}

const scope = () => ({ runId, key: `${runId}/draft/-/1` });
const ask = (): CompletionRequest => ({
  workspaceId,
  runId,
  stepId: 'draft',
  purpose: 'build:prose',
  profileId: 'balanced',
  tier: 'big',
  model: { provider: 'anthropic', model: 'overlap-model' },
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Write it.' }] }],
  maxOutputTokens: 1000,
});

function provider(opts: { hang?: boolean } = {}) {
  let calls = 0;
  const waiting: (() => void)[] = [];
  const adapter = {
    id: 'anthropic',
    async complete(req: { model: string }) {
      calls += 1;
      if (opts.hang) await new Promise<void>((r) => waiting.push(r));
      return { text: `answer ${calls}`, servedModel: req.model, usage: { inputTokens: 0, outputTokens: 1000 }, requestBody: {}, responseBody: {} };
    },
  } as unknown as ProviderAdapter;
  return { adapter, calls: () => calls, release: () => waiting.splice(0).forEach((r) => r()) };
}

/** The store, with its memo save held back until released: attempt 1 settled its call and has not kept it yet. */
function slowSave(inner: MemoStore) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let saving = false;
  const memo: Pick<Store, 'getMemo' | 'setMemo' | 'artifacts'> = {
    getMemo: (r, k) => inner.getMemo(r, k),
    artifacts: inner.artifacts,
    async setMemo(r, k, v) {
      saving = true;
      await gate;
      return inner.setMemo(r, k, v);
    },
  };
  return { memo, release, saving: () => saving };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean | Promise<boolean>, ms = 5000) => {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await sleep(5);
  }
};

describe('two attempts of one step’s paid call (F03 stage 3, ADR-0099)', () => {
  it('attempt 1 timed out between settlement and its memo save: attempt 2 waits and returns attempt 1’s answer; one provider call', async () => {
    const answers = provider();
    const worker = gateway({ anthropic: answers.adapter });
    const first = attempt();
    const save = slowSave(store);
    const one = memoGateway(worker, save.memo, scope(), { ...QUICK, operation: first.operation }).complete(ask());
    await until(() => save.saving());
    // Temporal times attempt 1 out: its cancel arrives in a heartbeat reply. Its settled call stays held regardless.
    first.cancel.abort(new Error('TIMED_OUT'));
    // Well past any lease: the holder keeps renewing a settled call until its invocation ends.
    for (let i = 0; i < 4; i++) await advance(LEASE / 2);
    const second = attempt();
    let twoDone = false;
    const two = memoGateway(worker, store, scope(), { ...QUICK, operation: second.operation })
      .complete(ask())
      .finally(() => (twoDone = true));
    await sleep(100);
    expect(twoDone).toBe(false);
    save.release();
    const kept = await one;
    first.invocation.stop();
    expect(await two).toEqual(kept);
    second.invocation.stop();
    expect(answers.calls()).toBe(1);
    expect(await worker.spend(workspaceId)).toMatchObject({ spentUsd: 0.1, inFlightUsd: 0, uncertainUsd: 0 });
  });

  it('attempt 1 keeps its answer and ends between attempt 2’s look for it and its next ask: attempt 2 finds the answer, never buys it twice', async () => {
    const answers = provider();
    const worker = gateway({ anthropic: answers.adapter });
    const first = attempt();
    const save = slowSave(store);
    const one = memoGateway(worker, save.memo, scope(), { ...QUICK, operation: first.operation }).complete(ask());
    await until(() => save.saving());
    // Attempt 2's second look finds nothing; right after it, attempt 1 keeps its answer and its invocation ends.
    let looks = 0;
    const racing: Pick<Store, 'getMemo' | 'setMemo' | 'artifacts'> = {
      artifacts: store.artifacts,
      setMemo: (r, k, v) => store.setMemo(r, k, v),
      async getMemo(r, k) {
        const hit = await store.getMemo(r, k);
        looks += 1;
        if (looks === 2) {
          save.release();
          await one;
          first.invocation.stop();
          await sleep(50);
        }
        return hit;
      },
    };
    const second = attempt();
    const two = await memoGateway(worker, racing, scope(), { ...QUICK, operation: second.operation }).complete(ask());
    expect(two).toEqual(await one);
    expect(answers.calls()).toBe(1);
    second.invocation.stop();
  });

  it('attempt 1 hung in its provider call past its timeout: attempt 2 takes the call over within one lease, and the first counts as may have been billed', async () => {
    const hung = provider({ hang: true });
    const answers = provider();
    const workerA = gateway({ anthropic: hung.adapter });
    const workerB = gateway({ anthropic: answers.adapter });
    const first = attempt();
    void memoGateway(workerA, store, scope(), { ...QUICK, operation: first.operation }).complete(ask()).catch(() => undefined);
    await until(() => hung.calls() === 1);
    first.cancel.abort(new Error('TIMED_OUT'));
    const second = attempt();
    const two = memoGateway(workerB, store, scope(), { ...QUICK, operation: second.operation }).complete(ask());
    await sleep(60);
    expect(answers.calls()).toBe(0);
    // One lease later (attempt 1 stopped renewing when it was cancelled), attempt 2 makes the call.
    clock.t += LEASE + 1;
    await expect(two).resolves.toMatchObject({ text: 'answer 1', costUsd: 0.1 });
    expect(answers.calls()).toBe(1);
    const spend = await workerB.spend(workspaceId);
    expect(spend).toMatchObject({ spentUsd: 0.1, uncertainUsd: 0.1, byRun: { [runId]: 0.1 } });
    expect((await workerB.spendRecords(workspaceId)).uncertain).toEqual([expect.objectContaining({ reason: 'interrupted', runId })]);
    hung.release();
    first.invocation.stop();
    second.invocation.stop();
  });

  it('a holder that never lets go: attempt 2 stops after its wait with a plain step failure, and pays nothing', async () => {
    const hung = provider({ hang: true });
    const worker = gateway({ anthropic: hung.adapter });
    const first = attempt();
    void memoGateway(worker, store, scope(), { ...QUICK, operation: first.operation }).complete(ask()).catch(() => undefined);
    await until(() => hung.calls() === 1);
    const second = attempt();
    const err = await memoGateway(worker, store, scope(), { ...QUICK, waitLimitMs: 150, operation: second.operation })
      .complete(ask())
      .catch((e: unknown) => e);
    // A step failure ends the run (there is no retry of one step), so the copy says what the person can do: start again.
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toBe(
      'Another attempt of this step’s AI model’s answer is still under way, so this attempt stopped after waiting rather than pay for it a second time. Start the run again.',
    );
    expect(hung.calls()).toBe(1);
    hung.release();
    first.invocation.stop();
    second.invocation.stop();
  });

  it('keeps the memo key as it was: the operation is added after hashing, and the key names the run and memo key', async () => {
    const seen: CompletionRequest[] = [];
    const answers = provider();
    const worker = gateway({ anthropic: answers.adapter });
    const spy = new Proxy(worker, {
      get(target, prop, receiver) {
        if (prop === 'complete') return async (req: CompletionRequest) => (seen.push(req), target.complete(req));
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    const first = attempt();
    await memoGateway(spy, store, scope(), { operation: first.operation }).complete(ask());
    const plain = memoGateway(worker, store, scope());
    // The same request without an operation finds the memo: the key did not change.
    await expect(plain.complete(ask())).resolves.toMatchObject({ text: 'answer 1' });
    expect(answers.calls()).toBe(1);
    const op = seen[0]?.operation;
    expect(op?.key).toMatch(new RegExp(`^${runId}/${runId}/draft/-/1/complete/[0-9a-f]{32}/1$`));
    expect(op?.until).toBe(first.invocation.done);
    expect(op?.cancel).toBe(first.cancel.signal);
    first.invocation.stop();
  });
});

/**
 * A decline whose one retry (ADR-0102) attempt 1 holds when attempt 2 starts. Attempt 2 finds the decline attempt 1
 * kept, so it asks the gateway for the retry alone; the spend book refuses it 'in-flight' (attempt 1 holds the retry's
 * key), and the gateway throws that as it is. The memo layer then waits, as for any call another attempt holds, and gets
 * attempt 1's kept final decline, word for word: the model is asked twice in all, never a third time.
 */
describe('two attempts of one step’s declined call (ADR-0102)', () => {
  it('attempt 2 waits while attempt 1 holds the retry, then gets attempt 1’s kept final decline; the model is asked twice in all', async () => {
    let calls = 0;
    const waiting: (() => void)[] = [];
    const adapter = {
      id: 'anthropic',
      async complete(req: { model: string }) {
        calls += 1;
        // The retry hangs until released, then declines again.
        if (calls === 2) await new Promise<void>((r) => waiting.push(r));
        return { text: '', refusal: 'declined (cyber)', declined: { reason: 'cyber' }, servedModel: req.model, usage: { inputTokens: 0, outputTokens: 1000 }, requestBody: {}, responseBody: {} };
      },
    } as unknown as ProviderAdapter;
    const worker = gateway({ anthropic: adapter });
    const first = attempt();
    const one = memoGateway(worker, store, scope(), { ...QUICK, operation: first.operation })
      .complete(ask())
      .catch((e: unknown) => e);
    await until(() => calls === 2);
    // Attempt 1 kept the decline and holds the retry.
    const seen: CompletionRequest[] = [];
    const watched = new Proxy(worker, {
      get(target, prop, receiver) {
        if (prop === 'complete') return async (req: CompletionRequest) => (seen.push(req), target.complete(req));
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    const second = attempt();
    let twoDone = false;
    const two = memoGateway(watched, store, scope(), { ...QUICK, operation: second.operation })
      .complete(ask())
      .catch((e: unknown) => e)
      .finally(() => (twoDone = true));
    await until(() => seen.length >= 3);
    // Attempt 2 asked for the retry alone, more than once (the memo asks again now and then), and is still waiting.
    expect(twoDone).toBe(false);
    for (const req of seen) {
      expect(req.operation).toMatchObject({ declinedEarlier: { costUsd: 0.1, reason: 'cyber' } });
      expect(req.operation).not.toHaveProperty('keepDecline');
    }
    expect(calls).toBe(2);
    waiting.splice(0).forEach((r) => r());
    const a = await one;
    first.invocation.stop();
    const b = await two;
    second.invocation.stop();
    expect(a).toBeInstanceOf(GatewayError);
    expect(a).toMatchObject({ code: 'refused', retryable: false, declined: { retry: 'declined', reason: 'cyber', costUsd: 0.1, retryCostUsd: 0.1 } });
    // The kept outcome, as attempt 1's gateway threw it.
    expect(b).toBeInstanceOf(GatewayError);
    expect(b).toMatchObject({ code: 'refused', retryable: false, message: (a as GatewayError).message, declined: (a as GatewayError).declined });
    expect(calls).toBe(2);
    expect(await worker.spend(workspaceId)).toMatchObject({ spentUsd: 0.2, inFlightUsd: 0, uncertainUsd: 0 });
  });
});

describe('a relay link’s clip, attempt 1 lost while fal makes it (F03 stage 3)', () => {
  const MODEL = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
  const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31]);
  const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

  /** A fal stand-in shared by both workers: jobs by request id, and a first status poll that never answers. */
  function fal() {
    const submissions: string[] = [];
    const polls: string[] = [];
    const jobs = new Map<string, string>();
    let lost = true;
    const client: FalClientLike = {
      storage: { upload: async () => 'https://v3.fal.media/upload.png' },
      queue: {
        async submit(endpoint) {
          submissions.push(endpoint);
          const id = `req-${jobs.size + 1}`;
          jobs.set(id, endpoint);
          return { request_id: id };
        },
        async subscribeToStatus(endpoint, options) {
          polls.push(options.requestId);
          if (jobs.get(options.requestId) !== endpoint) throw new Error(`no job ${options.requestId}`);
          if (lost) {
            lost = false;
            await new Promise(() => undefined);
          }
          return { status: 'COMPLETED' };
        },
        // A one-shot status read (a resumed job whose wait has run out is asked once): every job here finishes.
        async status() {
          return { status: 'COMPLETED' };
        },
        async result(endpoint, options) {
          const data = endpoint.includes('extract-frame') ? { images: [{ url: 'https://v3.fal.media/last.png' }] } : { video: { url: 'https://v3.fal.media/clip.mp4' } };
          return { data, requestId: options.requestId };
        },
        // No stop reaches these jobs: a worker that stops or dies hands its call over, never cuts it off (ADR-0111).
        async cancel() {
          throw new Error('no job is cancelled in these tests');
        },
      },
    };
    const media = (async (url: string | URL | Request) => new Response(String(url).endsWith('.mp4') ? MP4 : PNG)) as typeof fetch;
    return { client, media, submissions, polls };
  }

  it('attempt 2 resumes the clip from its stored request id: no new submission, one ledger entry', async () => {
    const f = fal();
    const workerA = gateway({ fal: f.client, fetch: f.media });
    const workerB = gateway({ fal: f.client, fetch: f.media });
    // A falAdapter is what both use (the gateway builds it from the injected client).
    expect(typeof falAdapter).toBe('function');
    const frame = (await store.artifacts.put(PNG, 'image/png')).id;
    const link = (): VideoRequest => ({ workspaceId, runId, stepId: 'relay', purpose: 'relay:media', profileId: 'balanced', prompt: 'Shot 1: dawn', startFrameArtifactId: frame, durationSec: 5, shot: 1 });
    const relayScope = { runId, key: `${runId}/relay/-/1` };
    const first = attempt();
    void memoGateway(workerA, store, relayScope, { ...QUICK, operation: first.operation }).video(link()).catch(() => undefined);
    await until(() => f.polls.length === 1);
    first.cancel.abort(new Error('TIMED_OUT'));
    await sleep(40);
    clock.t += LEASE + 1;
    const second = attempt();
    const clip = await memoGateway(workerB, store, relayScope, { ...QUICK, operation: second.operation }).video(link());
    expect(clip).toMatchObject({ provider: 'fal', mediaType: 'video/mp4' });
    expect(f.submissions).toEqual([MODEL, 'fal-ai/ffmpeg-api/extract-frame']);
    expect(await workerB.spend(workspaceId)).toMatchObject({ inFlightUsd: 0, uncertainUsd: 0, spentUsd: clip.costUsd });
    second.invocation.stop();
    first.invocation.stop();
    await workerB.close();
    await workerA.close();
    const ledgered = (await store.spendBook.ledgeredCalls()).filter((c) => c.runId === runId);
    expect(ledgered.map((c) => c.costUsd)).toEqual([clip.costUsd]);
  });
});
