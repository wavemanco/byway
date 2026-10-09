/**
 * Stage 3 of the spend book (F03; ADR-0099): a step's paid call keeps one identity across Temporal's attempts of the
 * step. The runner's memo layer passes SpendContext.operation: the call's key, `cancel` (Temporal cancelled the attempt,
 * a timeout included) and `until` (the attempt's invocation ended). The gateway holds the call in the spend book:
 * - while it is unsettled, as long as its caller lives and is not cancelled: another attempt is refused 'in-flight'
 *   (and the runner waits for the first one's result);
 * - once settled, until its invocation ends, so its result can be kept before anyone may buy the call again;
 * - a timed-out or dead holder's call is taken over within one lease, and a fal clip the provider accepted is resumed
 *   from its stored request ids, never submitted again.
 * Two gateways on one book stand for two workers (or the same worker before and after a restart).
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompletionRequest, SpendContext, VideoRequest } from '@byway/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGateway, type GatewayOptions, type ModelGateway } from '../src/gateway.ts';
import { MemorySpendBook } from '../src/memory-book.ts';
import { encodePng } from '../src/mock/png.ts';
import { PRICES, type PriceRow } from '../src/prices.ts';
import type { FalClientLike } from '../src/providers/fal.ts';
import type { ProviderAdapter, ProviderCompletion } from '../src/providers/types.ts';
import { fakeFal, fakeFetch, MemoryArtifacts } from './fakes.ts';

const KEYS = {
  ANTHROPIC_API_KEY: 'sk-ant-api03-test-not-a-real-key-000000',
  FAL_KEY: '0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6:00112233445566778899aabbccddeeff',
};
/** claude-opus-5-5 at $100 per million output tokens and nothing for input: 1,000 output tokens are $0.10. */
const PRICED: PriceRow[] = [...PRICES.filter((p) => p.model !== 'claude-opus-5-5'), { provider: 'anthropic', model: 'claude-opus-5-5', inputPerMTok: 0, outputPerMTok: 100, source: 'operation-key tests' }];
const LEASE = 60_000;

let clock: { t: number };
let book: MemorySpendBook;
let artifacts: MemoryArtifacts;
let dir: string;
const open: ModelGateway[] = [];
/** Renewals that reached the book, so a test that moves the clock waits for the holder to renew after the move. */
let renewals = 0;

beforeEach(async () => {
  for (const g of open.splice(0)) await g.close();
  dir = mkdtempSync(join(tmpdir(), 'byway-gw-keys-'));
  clock = { t: Date.parse('2026-10-09T12:00:00.000Z') };
  book = new MemorySpendBook({ now: () => new Date(clock.t) });
  renewals = 0;
  const renew = book.renew.bind(book);
  book.renew = async (...args) => {
    await renew(...args);
    renewals += 1;
  };
  artifacts = new MemoryArtifacts();
});

/** One worker's gateway on the shared book. Its holder renews every 10 ms, so a renewal follows any clock move quickly. */
function gateway(over: Partial<GatewayOptions> = {}): ModelGateway {
  const g = createGateway({
    ledgerPath: join(dir, 'ledger.jsonl'),
    artifacts,
    caps: { workspaceCapUsd: () => 10, runCapUsd: () => 10 },
    spendBook: book,
    env: KEYS,
    prices: PRICED,
    retry: { sleep: async () => {}, random: () => 0.5 },
    renewEveryMs: 10,
    ...over,
  });
  open.push(g);
  return g;
}

/** One attempt's view of a call: its key, and its own cancel and end. */
function attempt(key = 'run-1/run-1/draft/-/1/complete/abc/1') {
  const until = new AbortController();
  const cancel = new AbortController();
  const operation: NonNullable<SpendContext['operation']> = { key, until: until.signal, cancel: cancel.signal };
  return { until, cancel, operation };
}

const ask = (operation?: SpendContext['operation']): CompletionRequest => ({
  workspaceId: 'ws',
  runId: 'run-1',
  stepId: 'draft',
  purpose: 'build:prose',
  profileId: 'balanced',
  tier: 'big',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Write it.' }] }],
  maxOutputTokens: 1000,
  ...(operation ? { operation } : {}),
});

/** An Anthropic adapter whose calls wait until released. */
function heldAdapter() {
  const waiting: (() => void)[] = [];
  let calls = 0;
  const adapter: ProviderAdapter = {
    id: 'anthropic',
    async complete(req): Promise<ProviderCompletion> {
      calls++;
      await new Promise<void>((r) => waiting.push(r));
      return { text: 'done', servedModel: req.model, usage: { inputTokens: 10, outputTokens: 1000 }, requestBody: { model: req.model }, responseBody: { ok: true } };
    },
  };
  return { adapter, calls: () => calls, release: () => waiting.splice(0).forEach((r) => r()) };
}

/** An Anthropic adapter that answers at once. */
function answering() {
  let calls = 0;
  const adapter: ProviderAdapter = {
    id: 'anthropic',
    async complete(req): Promise<ProviderCompletion> {
      calls++;
      return { text: 'done', servedModel: req.model, usage: { inputTokens: 10, outputTokens: 1000 }, requestBody: { model: req.model }, responseBody: { ok: true } };
    },
  };
  return { adapter, calls: () => calls };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean | Promise<boolean>, ms = 5000) => {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await sleep(5);
  }
};

describe('one call across a step’s attempts (F03 stage 3, ADR-0099)', () => {
  it('refuses a second attempt while the first is in flight, as in-flight (retryable, nothing billed): the provider is asked once', async () => {
    const held = heldAdapter();
    const g = gateway({ adapters: { anthropic: held.adapter } });
    const a = attempt();
    const first = g.complete(ask(a.operation));
    await until(() => held.calls() === 1);
    await expect(g.complete(ask(attempt().operation))).rejects.toMatchObject({ name: 'GatewayError', code: 'in-flight', retryable: true, billed: false });
    expect(held.calls()).toBe(1);
    held.release();
    await expect(first).resolves.toMatchObject({ costUsd: 0.1 });
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0.1, inFlightUsd: 0 });
  });

  it('holds a settled call until its caller’s invocation ends, then lets it go at once: a later call with its key is a new, counted call', async () => {
    const provider = answering();
    const g = gateway({ adapters: { anthropic: provider.adapter } });
    const a = attempt();
    await g.complete(ask(a.operation));
    // The first attempt is still keeping its result (a memo save): another attempt waits for it rather than buy again.
    await expect(g.complete(ask(attempt().operation))).rejects.toMatchObject({ code: 'in-flight' });
    a.until.abort();
    await until(async () => (await g.complete(ask(attempt().operation)).then(() => true, () => false)));
    expect(provider.calls()).toBe(2);
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0.2 });
  });

  it('keeps an unsettled call held past its lease while its caller lives: the holder renews it', async () => {
    const held = heldAdapter();
    const g = gateway({ adapters: { anthropic: held.adapter } });
    void g.complete(ask(attempt().operation)).catch(() => undefined);
    await until(() => held.calls() === 1);
    for (let i = 0; i < 4; i++) {
      clock.t += LEASE / 2;
      // Two renewals after the move: the second certainly started after it.
      const seen = renewals;
      await until(() => renewals >= seen + 2);
    }
    await expect(g.complete(ask(attempt().operation))).rejects.toMatchObject({ code: 'in-flight' });
    expect(await g.spend('ws')).toMatchObject({ inFlightUsd: 0.1, uncertainUsd: 0 });
    held.release();
  });

  it('stops renewing an unsettled call once Temporal cancels its attempt (TIMED_OUT): another worker takes it over within one lease, and both calls are counted', async () => {
    const held = heldAdapter();
    const workerA = gateway({ adapters: { anthropic: held.adapter } });
    const workerB = gateway({ adapters: { anthropic: answering().adapter } });
    const a = attempt();
    const first = workerA.complete(ask(a.operation));
    await until(() => held.calls() === 1);
    a.cancel.abort(new Error('TIMED_OUT'));
    await sleep(40);
    // Within the lease the call is still held: the second attempt waits.
    await expect(workerB.complete(ask(attempt().operation))).rejects.toMatchObject({ code: 'in-flight' });
    clock.t += LEASE + 1;
    await sleep(40);
    await expect(workerB.complete(ask(attempt().operation))).resolves.toMatchObject({ costUsd: 0.1 });
    // The first attempt's call may have been billed: against the workspace, until its answer (if any) says.
    expect(await workerB.spend('ws')).toMatchObject({ spentUsd: 0.1, inFlightUsd: 0, uncertainUsd: 0.1 });
    expect((await workerB.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ reason: 'interrupted', usd: 0.1 })]);
    // It does answer after all: its true cost replaces the guess.
    held.release();
    await first;
    expect(await workerB.spend('ws')).toMatchObject({ spentUsd: 0.2, uncertainUsd: 0 });
  });

  it('holds a call from its settlement even when its caller had stopped renewing it: the key is not taken while its result is kept', async () => {
    const held = heldAdapter();
    const workerA = gateway({ adapters: { anthropic: held.adapter } });
    const workerB = gateway({ adapters: { anthropic: answering().adapter } });
    const a = attempt();
    const first = workerA.complete(ask(a.operation));
    await until(() => held.calls() === 1);
    a.cancel.abort(new Error('TIMED_OUT'));
    await sleep(40);
    // The hung call answers just before its lease would run out.
    clock.t += LEASE - 1000;
    held.release();
    await first;
    clock.t += LEASE / 2;
    await expect(workerB.complete(ask(attempt().operation))).rejects.toMatchObject({ code: 'in-flight' });
    a.until.abort();
    await until(async () => (await workerB.complete(ask(attempt().operation)).then(() => true, () => false)));
  });

  it('lets a settled call go when its gateway closes (a clean stop): a step retried on a new worker does not wait out the lease', async () => {
    const workerA = gateway({ adapters: { anthropic: answering().adapter } });
    await workerA.complete(ask(attempt().operation));
    await workerA.close();
    const workerB = gateway({ adapters: { anthropic: answering().adapter } });
    await expect(workerB.complete(ask(attempt().operation))).resolves.toMatchObject({ costUsd: 0.1 });
  });

  it('refuses an operation that is not a key with its signals, before anything is reserved', async () => {
    const g = gateway({ adapters: { anthropic: answering().adapter } });
    const bad = [{ key: '', until: new AbortController().signal }, { key: 'k', until: 'soon' }, { key: 'k', until: new AbortController().signal, cancel: 5 }];
    for (const operation of bad) {
      await expect(g.complete(ask(operation as unknown as SpendContext['operation']))).rejects.toMatchObject({ code: 'invalid-request' });
    }
    expect(await g.spend('ws')).toMatchObject({ inFlightUsd: 0, spentUsd: 0 });
  });
});

describe('a fal clip accepted by the provider is resumed, never submitted again (F03 stage 3)', () => {
  const MODEL = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';

  /** fakeFal, whose first status poll never answers: the worker that made it is lost while fal works on the clip. */
  function lostPoll() {
    const fal = fakeFal();
    let first = true;
    const client: FalClientLike = {
      ...fal.client,
      queue: {
        ...fal.client.queue,
        async subscribeToStatus(endpoint, options) {
          if (first) {
            first = false;
            fal.polls.push(options.requestId);
            await new Promise(() => undefined);
          }
          return fal.client.queue.subscribeToStatus(endpoint, options);
        },
      },
    };
    return { fal, client };
  }

  async function clip(operation: SpendContext['operation']): Promise<VideoRequest> {
    const frame = (await artifacts.put(encodePng(4, 2, new Uint8Array(24).fill(200)), 'image/png')).id;
    return { workspaceId: 'ws', runId: 'run-1', stepId: 'relay', purpose: 'relay:media', profileId: 'balanced', prompt: 'Shot 1: dawn', startFrameArtifactId: frame, durationSec: 5, shot: 1, ...(operation ? { operation } : {}) };
  }

  it('the second attempt polls the stored request id: one submission, one clip, one ledger entry', async () => {
    const { fal, client } = lostPoll();
    const media = fakeFetch();
    const workerA = gateway({ clients: { fal: client }, fetch: media.fetch });
    const workerB = gateway({ clients: { fal: client }, fetch: media.fetch });
    const key = 'run-1/run-1/relay/-/1/video/abc/1';
    const a = attempt(key);
    void workerA.video(await clip(a.operation)).catch(() => undefined);
    await until(() => fal.polls.length === 1);
    expect((await workerA.spendRecords('ws')).inFlight).toEqual([expect.objectContaining({ provider: 'fal' })]);
    // Temporal times the attempt out; the worker is gone for good. One lease later, the step's next attempt runs.
    a.cancel.abort(new Error('TIMED_OUT'));
    await sleep(40);
    clock.t += LEASE + 1;
    const out = await workerB.video(await clip(attempt(key).operation));
    expect(out).toMatchObject({ provider: 'fal', mediaType: 'video/mp4' });
    expect(fal.calls.map((c) => c.endpoint)).toEqual([MODEL, 'fal-ai/ffmpeg-api/extract-frame']);
    expect(fal.uploads).toHaveLength(1);
    expect(fal.polls.filter((id) => id === 'req-1')).toHaveLength(2);
    const spend = await workerB.spend('ws');
    expect(spend).toMatchObject({ inFlightUsd: 0, uncertainUsd: 0, spentUsd: out.costUsd });
    await workerB.close();
    await workerA.close();
    expect((await book.ledgeredCalls()).map((c) => c.costUsd)).toEqual([out.costUsd]);
  });
});
