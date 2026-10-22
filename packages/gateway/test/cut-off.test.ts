/**
 * The true stop for Cancel (ADR-0111). A call's run is ending (SpendContext.operation.stop): the gateway sends nothing
 * more for it, ends a retry's wait at once, and hands the signal to the adapters that can cut their call off:
 * Anthropic's and the OpenAI and OpenRouter streams (closed), fal's queue jobs (cancelled), the demo's mock. A call cut
 * off after it was sent has no ledger entry; the spend book counts it at its reservation as "may have been billed", as
 * interrupted, until it is cleared. Google's calls and every image call are handed no signal and finish as today.
 *
 * Every fake answers only when its signal aborts, or aborts the stop itself at the moment under test: no test waits on
 * the clock.
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APIUserAbortError } from '@anthropic-ai/sdk';
import { GatewayError, type CompletionRequest, type ImageRequest, type VideoRequest } from '@byway/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { cutOffError, isCutOff, toGatewayError } from '../src/errors.ts';
import { createGateway, type GatewayOptions, type ModelGateway } from '../src/gateway.ts';
import { MemorySpendBook } from '../src/memory-book.ts';
import { encodePng } from '../src/mock/png.ts';
import { mockAdapter } from '../src/providers/mock.ts';
import type { AnthropicClientLike } from '../src/providers/anthropic.ts';
import { cancelJob, FAL_EXTRACT_FRAME, falAppId, type FalCancel, type FalClientLike } from '../src/providers/fal.ts';
import { googleAdapter } from '../src/providers/google.ts';
import { completeStreamed, readChatStream, type ChatChunkLike, type OpenAIClientLike } from '../src/providers/openai.ts';
import type { ProviderAdapter, ProviderCompletionRequest, ProviderImageRequest } from '../src/providers/types.ts';
import { makeRedactor } from '../src/redact.ts';
import { anthropicMessage, fakeFetch, fakeGoogle, fakeOpenAI, MemoryArtifacts, streamOf } from './fakes.ts';

/** Placeholders shaped like each provider's keys; none is a real key, and no test reaches a network. */
const KEYS = {
  ANTHROPIC_API_KEY: 'sk-ant-api03-test-not-a-real-key-000000',
  OPENAI_API_KEY: 'sk-proj-test-not-a-real-key-000000',
  OPENROUTER_API_KEY: 'sk-or-v1-test-not-a-real-key-000000',
  GEMINI_API_KEY: 'AIza-test-not-a-real-key-000000',
  FAL_KEY: '0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6:00112233445566778899aabbccddeeff',
};
const BALANCED_VIDEO = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';

let dir: string;
let book: MemorySpendBook;
let artifacts: MemoryArtifacts;
const open: ModelGateway[] = [];

beforeEach(async () => {
  for (const g of open.splice(0)) await g.close();
  dir = mkdtempSync(join(tmpdir(), 'byway-cut-off-'));
  book = new MemorySpendBook();
  artifacts = new MemoryArtifacts();
});

function gateway(over: Partial<GatewayOptions> = {}): ModelGateway {
  const g = createGateway({
    ledgerPath: join(dir, 'ledger.jsonl'),
    artifacts,
    caps: { workspaceCapUsd: () => 100, runCapUsd: () => 50 },
    spendBook: book,
    env: { ...KEYS },
    retry: { sleep: async () => {}, random: () => 0.5 },
    now: () => new Date('2026-10-21T12:00:00Z'),
    ...over,
  });
  open.push(g);
  return g;
}

const ledger = (): Record<string, unknown>[] =>
  existsSync(join(dir, 'ledger.jsonl')) ? readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : [];

/** A step's caller: its invocation (until), Temporal's cancel of it, and the stop the cancel turned into. */
function caller(key = 'run-1/step/complete/abc/1') {
  const stop = new AbortController();
  const until = new AbortController();
  return { stop, until, operation: { key, until: until.signal, cancel: stop.signal, stop: stop.signal } };
}

const ask = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  workspaceId: 'ws',
  runId: 'run-1',
  stepId: 'draft',
  purpose: 'build:prose',
  profileId: 'balanced',
  tier: 'big',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Write it.' }] }],
  maxOutputTokens: 1000,
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

/** An Anthropic client whose streams are held until their signal aborts, then fail as the SDK's do. */
function heldAnthropic(onHeld: () => void | Promise<void>) {
  const signals: (AbortSignal | undefined)[] = [];
  const client: AnthropicClientLike = {
    beta: {
      messages: {
        stream(_body, options) {
          signals.push(options?.signal);
          return {
            finalMessage: () =>
              new Promise((_, reject) => {
                const signal = options?.signal;
                if (!signal) return reject(new Error('the stream was given no signal'));
                signal.addEventListener('abort', () => reject(new APIUserAbortError()), { once: true });
                void onHeld();
              }),
          };
        },
      },
    },
  };
  return { client, signals };
}

describe('a stop cuts off a streamed Anthropic call', () => {
  it('closes the stream: one request was sent and none again, no ledger entry, and the call is interrupted at its reservation', async () => {
    const { stop, operation } = caller();
    let heldAt: number | undefined;
    const held = heldAnthropic(async () => {
      heldAt = (await g.spendRecords('ws')).inFlight[0]?.usd;
      stop.abort();
    });
    const g = gateway({ clients: { anthropic: held.client } });
    const err = await failure(g.complete(ask({ operation })));
    expect(isCutOff(err)).toBe(true);
    expect(err).toMatchObject({ code: 'byway-failure', retryable: false, billing: 'maybe' });
    expect(err.message).toMatch(/^byway cut off this anthropic call because its run was ending\. .* listed in Settings under Spending records until you clear it\.$/);
    // Sent once, with the stop's own signal, and not sent again.
    expect(held.signals).toEqual([stop.signal]);
    expect(ledger()).toEqual([]);
    expect(heldAt).toBeGreaterThan(0);
    const records = await g.spendRecords('ws');
    expect(records.inFlight).toEqual([]);
    expect(records.uncertain).toEqual([expect.objectContaining({ runId: 'run-1', provider: 'anthropic', model: 'claude-opus-5-5', usd: heldAt, reason: 'interrupted' })]);
    expect((await g.spend('ws')).uncertainUsd).toBe(heldAt);
  });

  it('sends nothing when the stop came first, and the call counts nothing', async () => {
    const { stop, operation } = caller();
    stop.abort();
    const held = heldAnthropic(() => undefined);
    const g = gateway({ clients: { anthropic: held.client } });
    const err = await failure(g.complete(ask({ operation })));
    expect(err).toMatchObject({ code: 'byway-failure', billing: 'none', billed: false });
    expect(held.signals).toEqual([]);
    expect(await g.spendRecords('ws')).toMatchObject({ inFlight: [], uncertain: [] });
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0, inFlightUsd: 0, uncertainUsd: 0 });
  });

  it('settles an answer that arrived as the stop came, at its true cost', async () => {
    const { stop, operation } = caller();
    const client: AnthropicClientLike = {
      beta: {
        messages: {
          stream: () => ({
            finalMessage: async () => {
              stop.abort();
              return anthropicMessage();
            },
          }),
        },
      },
    };
    const g = gateway({ clients: { anthropic: client } });
    const res = await g.complete(ask({ operation }));
    expect(res.costUsd).toBeGreaterThan(0);
    expect(ledger()).toHaveLength(1);
    expect((await g.spendRecords('ws')).uncertain).toEqual([]);
  });

  it('cuts off the one retry after a decline as the declined call was: the retry is handed the same stop', async () => {
    const { stop, operation } = caller();
    const signals: (AbortSignal | undefined)[] = [];
    const client: AnthropicClientLike = {
      beta: {
        messages: {
          stream(_body, options) {
            signals.push(options?.signal);
            if (signals.length === 1) return { finalMessage: async () => anthropicMessage({ stop_reason: 'refusal', content: [] }) };
            return {
              finalMessage: () =>
                new Promise((_, reject) => {
                  options?.signal?.addEventListener('abort', () => reject(new APIUserAbortError()), { once: true });
                  stop.abort();
                }),
            };
          },
        },
      },
    };
    const g = gateway({ clients: { anthropic: client } });
    const err = await failure(g.complete(ask({ operation: { ...operation, keepDecline: async () => undefined } })));
    // The cut-off retry is thrown as it is: not a final decline the memo would keep for a run that has ended.
    expect(isCutOff(err)).toBe(true);
    expect(err.declined).toBeUndefined();
    expect(signals).toEqual([stop.signal, stop.signal]);
    // The decline was settled and ledgered; its retry was cut off and is counted as interrupted.
    expect(ledger()).toHaveLength(1);
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ reason: 'interrupted' })]);
  });
});

describe('a stop during the wait before a resend', () => {
  it('ends the wait at once, and the next attempt is never sent', async () => {
    const { stop, operation } = caller();
    let sent = 0;
    const client: AnthropicClientLike = {
      beta: {
        messages: {
          stream: () => {
            sent++;
            // Anthropic's own overloaded answer: certainly not billed, and retried after a wait.
            return { finalMessage: async () => Promise.reject(Object.assign(new Error('overloaded'), { status: 529, error: { type: 'error', error: { type: 'overloaded_error' } } })) };
          },
        },
      },
    };
    // The wait never ends by itself: only the stop can end it.
    const g = gateway({ clients: { anthropic: client }, retry: { sleep: () => (stop.abort(), new Promise<void>(() => undefined)), random: () => 0.5 } });
    const err = await failure(g.complete(ask({ operation })));
    expect(sent).toBe(1);
    expect(err.message).toMatch(/^anthropic returned 529/);
    // That attempt was certainly not billed, so the call is released: it counts nothing.
    expect(await g.spendRecords('ws')).toMatchObject({ inFlight: [], uncertain: [] });
  });

  it('retains nothing for a send that may have been billed and is then not sent again', async () => {
    const { stop, operation } = caller();
    let sent = 0;
    let heldAt: number | undefined;
    const client: AnthropicClientLike = {
      beta: {
        messages: {
          stream: () => {
            sent++;
            return {
              finalMessage: async () => {
                heldAt = (await g.spendRecords('ws')).inFlight[0]?.usd;
                throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
              },
            };
          },
        },
      },
    };
    const g = gateway({ clients: { anthropic: client }, retry: { sleep: () => (stop.abort(), new Promise<void>(() => undefined)), random: () => 0.5 } });
    await failure(g.complete(ask({ operation })));
    expect(sent).toBe(1);
    // Counted once, at its reservation, as the attempt that may have been billed ('failed'), and not again as a resend.
    expect(heldAt).toBeGreaterThan(0);
    const records = await g.spendRecords('ws');
    expect(records.uncertain).toEqual([expect.objectContaining({ reason: 'failed', usd: heldAt })]);
    expect((await g.spend('ws')).uncertainUsd).toBe(heldAt);
  });
});

describe('calls a stop does not cut off', () => {
  it('a Google call is handed no signal, finishes after the stop, and is settled at its true cost', async () => {
    const { stop, operation } = caller();
    const google = fakeGoogle([
      () => {
        stop.abort();
        return { modelVersion: 'gemini-3.8-flash', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Done.' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } };
      },
    ]);
    const inner = googleAdapter({ client: google.client });
    expect(inner.cutsOff).toBeUndefined();
    const seen: ProviderCompletionRequest[] = [];
    const g = gateway({ adapters: { google: { ...inner, complete: (req) => (seen.push(req), inner.complete(req)) } } });
    const res = await g.complete(ask({ profileId: 'google', tier: 'mid', operation }));
    expect(stop.signal.aborted).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toHaveProperty('signal');
    expect(JSON.stringify(google.calls[0])).not.toContain('abortSignal');
    expect(res.text).toBe('Done.');
    expect(ledger()).toEqual([expect.objectContaining({ provider: 'google', costUsd: res.costUsd })]);
    expect((await g.spendRecords('ws')).uncertain).toEqual([]);
  });

  it('an image call is handed no signal, even by an adapter that cuts its other calls off', async () => {
    const { stop, operation } = caller();
    const seen: ProviderImageRequest[] = [];
    const png = encodePng(2, 2, new Uint8Array(12).fill(10));
    const adapter: ProviderAdapter = {
      id: 'openai',
      cutsOff: { complete: true, video: true },
      complete: async () => {
        throw new Error('not used');
      },
      image: async (req) => {
        seen.push(req);
        stop.abort();
        return { bytes: png, mediaType: 'image/png', servedModel: req.model, usage: { inputTokens: 10, outputTokens: 100, units: 1 }, requestBody: { model: req.model }, responseBody: { ok: true } };
      },
    };
    const g = gateway({ adapters: { openai: adapter } });
    const imageReq: ImageRequest = { workspaceId: 'ws', runId: 'run-1', stepId: 'art', purpose: 'asset:web-page', profileId: 'best', prompt: 'A loaf at dawn', size: '1024x1024', operation };
    const res = await g.image(imageReq);
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toHaveProperty('signal');
    expect(res.costUsd).toBeGreaterThan(0);
    expect(ledger()).toHaveLength(1);
  });

  it('a call stopped before it is sent is refused for every provider, an image included', async () => {
    const { stop, operation } = caller();
    stop.abort();
    const openai = fakeOpenAI();
    const g = gateway({ clients: { openai: openai.client } });
    const imageReq: ImageRequest = { workspaceId: 'ws', runId: 'run-1', stepId: 'art', purpose: 'asset:web-page', profileId: 'best', prompt: 'A loaf at dawn', size: '1024x1024', operation };
    expect(await failure(g.image(imageReq))).toMatchObject({ code: 'byway-failure', billed: false });
    expect(openai.calls).toEqual([]);
    expect(await g.spend('ws')).toMatchObject({ inFlightUsd: 0, uncertainUsd: 0 });
  });
});

describe('the demo mock is cut off like a stream', () => {
  it('declares it, answers at once, and refuses to answer once its stop has come', async () => {
    const mock = mockAdapter();
    expect(mock.cutsOff).toEqual({ complete: true });
    const signal = AbortSignal.abort();
    const req: ProviderCompletionRequest = { model: 'mock-mid', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], maxOutputTokens: 100, responseFormat: 'text', context: { workspaceId: 'ws', purpose: 'build:prose', profileId: 'demo' }, signal };
    await expect(mock.complete(req)).rejects.toMatchObject({ name: 'AbortError' });
    const { signal: _s, ...whole } = req;
    expect((await mock.complete(whole)).text.length).toBeGreaterThan(0);
  });
});

// --- OpenAI and OpenRouter, streamed (the owner's "Approve, and stream OpenAI/OpenRouter too") ----------------------

/** Chunks as OpenAI sends them with include_usage: content deltas, a finishing chunk, then usage with no choices. */
const openaiChunks = (over: { usage?: ChatChunkLike['usage'] | null; finish?: string; refusal?: string } = {}): ChatChunkLike[] => [
  { id: 'c1', model: 'gpt-6-astra-2026-09-01', choices: [{ index: 0, delta: { content: 'Choice' }, finish_reason: null }] },
  { id: 'c1', model: 'gpt-6-astra-2026-09-01', choices: [{ index: 0, delta: { content: ': A' }, finish_reason: null }] },
  ...(over.refusal ? [{ id: 'c1', model: 'gpt-6-astra-2026-09-01', choices: [{ index: 0, delta: { refusal: over.refusal }, finish_reason: null }] }] : []),
  { id: 'c1', model: 'gpt-6-astra-2026-09-01', choices: [{ index: 0, delta: {}, finish_reason: over.finish ?? 'stop' }] },
  ...(over.usage === null
    ? []
    : [{ id: 'c1', model: 'gpt-6-astra-2026-09-01', choices: [], usage: over.usage ?? { prompt_tokens: 2000, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 500, cache_write_tokens: 1000 } } }]),
];

/** Chunks as OpenRouter sends them: `provider` on each, and usage with `cost` on a last chunk that repeats the finish. */
const openrouterChunks = (): ChatChunkLike[] => [
  { id: 'gen-1', model: 'anthropic/claude-opus-5.5', provider: 'Anthropic', choices: [{ index: 0, delta: { content: 'Choice: B' }, finish_reason: null }] },
  { id: 'gen-1', model: 'anthropic/claude-opus-5.5', provider: 'Anthropic', choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }] },
  {
    id: 'gen-1',
    model: 'anthropic/claude-opus-5.5',
    provider: 'Anthropic',
    choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1200, completion_tokens: 80, prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 1000 }, cost: 0.0213 },
  },
];

/** A stream that yields `chunks`, then (with a signal) waits for it and ends quietly, as the OpenAI SDK ends an aborted one. */
async function* heldStream(chunks: ChatChunkLike[], signal: AbortSignal | undefined, onHeld: () => void): AsyncGenerator<ChatChunkLike> {
  for (const c of chunks) yield c;
  if (!signal) throw new Error('the stream was given no signal');
  await new Promise<void>((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true });
    onHeld();
  });
}

/** A chat client whose streams come from `make`, recording each body and its options. */
function chatClient(make: (n: number, signal: AbortSignal | undefined) => AsyncIterable<ChatChunkLike>) {
  const bodies: Record<string, unknown>[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  const client: OpenAIClientLike = {
    chat: {
      completions: {
        async create(body, options) {
          bodies.push(body as unknown as Record<string, unknown>);
          signals.push(options?.signal);
          return make(bodies.length, options?.signal);
        },
      },
    },
    images: {
      generate: async () => {
        throw new Error('not used');
      },
    },
  };
  return { client, bodies, signals };
}

describe('a streamed chat answer, read as a whole one', () => {
  it('reads OpenAI’s usage from its last chunk, with cached reads and cache writes, and asks for that chunk', async () => {
    const chat = chatClient(() => streamOf(openaiChunks()));
    const g = gateway({ clients: { openai: chat.client } });
    const res = await g.complete(ask({ profileId: 'openai' }));
    expect(chat.bodies[0]).toMatchObject({ model: 'gpt-6-astra', stream: true, stream_options: { include_usage: true } });
    expect(res.text).toBe('Choice: A');
    expect(res.usage).toEqual({ inputTokens: 2000, outputTokens: 300 });
    expect(res.servedModel).toBe('gpt-6-astra-2026-09-01');
    // At gpt-6-astra's rates (prices.ts): 500 cached reads at $1, 1,000 cache writes at $12.50, the other 500 inputs at
    // $10, and 300 outputs at $50, per million (ADR-0109's cache-write rates).
    expect(res.costUsd).toBeCloseTo((500 * 1 + 1000 * 12.5 + 500 * 10 + 300 * 50) / 1e6, 10);
    expect(ledger()[0]).not.toHaveProperty('priceBasis');
  });

  it('takes OpenRouter’s reported cost and serving host from its last chunk, and does not ask for usage it always sends', async () => {
    const chat = chatClient(() => streamOf(openrouterChunks()));
    const g = gateway({ clients: { openrouter: chat.client } });
    const res = await g.complete(ask({ profileId: 'openrouter' }));
    expect(chat.bodies[0]).toMatchObject({ stream: true, provider: { only: ['anthropic'], allow_fallbacks: false } });
    expect(chat.bodies[0]).not.toHaveProperty('stream_options');
    expect(res.text).toBe('Choice: B');
    // OpenRouter's cost takes precedence over the price table (ADR-0091).
    expect(res.costUsd).toBe(0.0213);
    expect(ledger()[0]).toMatchObject({ upstreamProvider: 'Anthropic', costUsd: 0.0213 });
  });

  it('reads a refusal sent in deltas and a content-filter stop as declines, and a length stop as cut short', async () => {
    const declined = await completeStreamed(streamOf(openaiChunks({ refusal: 'I cannot help with that.' })), 'openai', undefined);
    expect(declined).toMatchObject({ refusal: 'declined: I cannot help with that.', declined: { reason: 'I cannot help with that.' } });
    const filtered = await completeStreamed(streamOf(openaiChunks({ finish: 'content_filter' })), 'openai', undefined);
    expect(filtered).toMatchObject({ refusal: 'declined (content filter)', declined: { reason: 'content filter' } });
    expect((await completeStreamed(streamOf(openaiChunks({ finish: 'length' })), 'openai', undefined)).truncated).toBe(true);
  });

  it('settles an answer whose usage chunk never came at its planning figures, marked as an assumed price', async () => {
    const chat = chatClient(() => streamOf(openaiChunks({ usage: null })));
    const g = gateway({ clients: { openai: chat.client } });
    const res = await g.complete(ask({ profileId: 'openai' }));
    expect(res.text).toBe('Choice: A');
    // The planning figures: the estimated input, and the whole output allowance (1,000 tokens at $50 per million).
    expect(res.usage.outputTokens).toBe(1000);
    expect(res.costUsd).toBeGreaterThanOrEqual(0.05);
    expect(ledger()[0]).toMatchObject({ priceBasis: 'assumed' });
  });

  it('reads an error chunk mid-stream as "may have been billed", and sends the call once more with that attempt retained', async () => {
    const midStream = Object.assign(new Error('Provider returned error'), { error: { code: 502, message: 'Provider returned error' } });
    const chat = chatClient((n) =>
      n === 1
        ? (async function* () {
            yield openrouterChunks()[0] as ChatChunkLike;
            throw midStream;
          })()
        : streamOf(openrouterChunks()),
    );
    const g = gateway({ clients: { openrouter: chat.client } });
    const res = await g.complete(ask({ profileId: 'openrouter' }));
    expect(chat.bodies).toHaveLength(2);
    expect(res.costUsd).toBe(0.0213);
    // The first attempt's bound stays counted, as for any resend after an attempt that may have been billed (ADR-0095).
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ reason: 'resent' })]);
  });

  it('reads a stream that ended without its finishing chunk the same way, and a finish of "error" too', async () => {
    const quiet = readChatStream(streamOf(openaiChunks().slice(0, 2)), 'openai');
    const err = await quiet.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ billing: 'maybe' });
    const mapped = toGatewayError(err, 'openai', makeRedactor({}));
    expect(mapped).toMatchObject({ code: 'provider-error', retryable: true, billing: 'maybe' });
    await expect(readChatStream(streamOf(openaiChunks({ finish: 'error' })), 'openrouter')).rejects.toMatchObject({ billing: 'maybe' });
  });

  it('settles a stream that broke after its finishing chunk, since its answer arrived', async () => {
    const chunks = openaiChunks();
    const broke = (async function* () {
      for (const c of chunks.slice(0, 3)) yield c;
      throw Object.assign(new Error('terminated'), { cause: { code: 'UND_ERR_SOCKET' } });
    })();
    const out = await completeStreamed(broke, 'openai', undefined);
    expect(out.text).toBe('Choice: A');
    expect(out.usage.inputTokens).toBeNaN();
  });
});

describe('a stop cuts off a streamed OpenAI or OpenRouter call', () => {
  it.each([
    ['openai', 'openai', openaiChunks],
    ['openrouter', 'openrouter', openrouterChunks],
  ] as const)('%s: a stream cut off before its usage arrived is not ledgered, and is interrupted at its reservation', async (provider, profileId, chunks) => {
    const { stop, operation } = caller();
    let heldAt: number | undefined;
    const chat = chatClient((_n, signal) =>
      heldStream(chunks().slice(0, 1), signal, () => {
        void g.spendRecords('ws').then((r) => {
          heldAt = r.inFlight[0]?.usd;
          stop.abort();
        });
      }),
    );
    const g = gateway({ clients: { [provider]: chat.client } });
    const err = await failure(g.complete(ask({ profileId, operation })));
    expect(isCutOff(err)).toBe(true);
    expect(chat.signals).toEqual([stop.signal]);
    expect(ledger()).toEqual([]);
    expect(heldAt).toBeGreaterThan(0);
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ provider, usd: heldAt, reason: 'interrupted' })]);
  });

  it('a stop that comes before the stream answers (the SDK rejects its request) is a cut-off too', async () => {
    const { stop, operation } = caller();
    const client: OpenAIClientLike = {
      chat: {
        completions: {
          create: (_body, options) =>
            new Promise((_, reject) => {
              options?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' })), { once: true });
              stop.abort();
            }),
        },
      },
      images: { generate: async () => ({}) },
    };
    const g = gateway({ clients: { openai: client } });
    const err = await failure(g.complete(ask({ profileId: 'openai', operation })));
    expect(isCutOff(err)).toBe(true);
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ reason: 'interrupted' })]);
  });
});

// --- fal's queue jobs ------------------------------------------------------------------------------------------------

/** A fal client whose clip job is accepted and then held in its status poll until the stop aborts it. */
function heldFal(cancel: FalCancel | (() => FalCancel), opts: { stopAt?: 'poll' | 'result' } = {}) {
  const submitted: string[] = [];
  const cancels: { endpoint: string; requestId: string }[] = [];
  const control = { stop: undefined as AbortController | undefined };
  const client: FalClientLike = {
    storage: { upload: async () => 'https://v3.fal.media/files/upload.png' },
    queue: {
      async submit(endpoint) {
        submitted.push(endpoint);
        return { request_id: `req-${submitted.length}` };
      },
      subscribeToStatus(_endpoint, options) {
        if (opts.stopAt === 'result') return Promise.resolve({ status: 'COMPLETED' });
        return new Promise((_, reject) => {
          const signal = options.abortSignal;
          if (!signal) return reject(new Error('the poll was given no signal'));
          signal.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })), { once: true });
          control.stop?.abort();
        });
      },
      result: () =>
        new Promise((resolve) => {
          control.stop?.abort();
          resolve({ data: { video: { url: 'https://v3.fal.media/files/clip.mp4' } }, requestId: 'req-1' });
        }),
      async cancel(endpoint, options) {
        cancels.push({ endpoint, requestId: options.requestId });
        return typeof cancel === 'function' ? cancel() : cancel;
      },
    },
  };
  return { client, submitted, cancels, control };
}

describe('a stop cancels fal’s queue job', () => {
  let startFrame: string;
  beforeEach(async () => {
    startFrame = (await artifacts.put(encodePng(4, 2, new Uint8Array(24).fill(200)), 'image/png')).id;
  });
  const video = (operation: VideoRequest['operation']): VideoRequest => ({
    workspaceId: 'ws',
    runId: 'run-1',
    stepId: 'clip',
    purpose: 'relay:media',
    profileId: 'balanced',
    prompt: 'Shot 2: the runner crests the ridge at dawn',
    startFrameArtifactId: startFrame,
    durationSec: 5,
    ...(operation ? { operation } : {}),
  });

  it('removed from the queue before it ran (200): one cancel with its request id, and the call counts nothing', async () => {
    const { stop, operation } = caller('run-1/clip/video/abc/1');
    const fal = heldFal({ status: 'removed', detail: 'HTTP 200 OK' });
    fal.control.stop = stop;
    const fetch = fakeFetch();
    const g = gateway({ clients: { fal: fal.client }, fetch: fetch.fetch });
    const err = await failure(g.video(video(operation)));
    expect(err).toMatchObject({ code: 'byway-failure', billing: 'none', billed: false });
    expect(fal.cancels).toEqual([{ endpoint: BALANCED_VIDEO, requestId: 'req-1' }]);
    expect(fal.submitted).toEqual([BALANCED_VIDEO]);
    expect(fetch.requested).toEqual([]);
    expect(ledger()).toEqual([]);
    expect(await g.spendRecords('ws')).toMatchObject({ inFlight: [], uncertain: [] });
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0, inFlightUsd: 0, uncertainUsd: 0 });
  });

  it.each([
    ['asked to stop while running (202)', { status: 'requested', detail: 'HTTP 202 CANCELLATION_REQUESTED' }],
    ['a cancel that did not go through (404)', { status: 'failed', detail: 'HTTP 404 NOT_FOUND' }],
  ] as const)('%s: interrupted at its reservation, listed with the job’s request id', async (_what, answer) => {
    const { stop, operation } = caller('run-1/clip/video/abc/1');
    const fal = heldFal(answer);
    fal.control.stop = stop;
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const err = await failure(g.video(video(operation)));
    expect(isCutOff(err)).toBe(true);
    expect(err).toMatchObject({ billing: 'maybe' });
    expect(fal.cancels).toEqual([{ endpoint: BALANCED_VIDEO, requestId: 'req-1' }]);
    expect(ledger()).toEqual([]);
    const uncertain = (await g.spendRecords('ws')).uncertain;
    expect(uncertain).toEqual([expect.objectContaining({ provider: 'fal', reason: 'interrupted', providerJobs: { generation: 'req-1' } })]);
    expect(uncertain[0]?.usd).toBeGreaterThan(0.35);
  });

  it('already completed (400): settled at its seconds through the made-and-billed path, with no download and no frame job', async () => {
    const { stop, operation } = caller('run-1/clip/video/abc/1');
    const fal = heldFal({ status: 'completed', detail: 'HTTP 400 ALREADY_COMPLETED' });
    fal.control.stop = stop;
    const fetch = fakeFetch();
    const g = gateway({ clients: { fal: fal.client }, fetch: fetch.fetch });
    const err = await failure(g.video(video(operation)));
    expect(err).toMatchObject({ code: 'byway-failure', billed: true });
    expect(err.message).toBe('fal made the clip and billed it (its cost is recorded), but its run was ending, so byway did not download it.');
    expect(fal.submitted).toEqual([BALANCED_VIDEO]);
    expect(fetch.requested).toEqual([]);
    expect(ledger()).toEqual([expect.objectContaining({ kind: 'video', provider: 'fal', usage: expect.objectContaining({ units: 5 }) })]);
    expect((await g.spendRecords('ws')).uncertain).toEqual([]);
  });

  it('done before the stop (its status said so): settled as made, never cancelled and never downloaded', async () => {
    const { stop, operation } = caller('run-1/clip/video/abc/1');
    const fal = heldFal({ status: 'failed', detail: 'not asked' }, { stopAt: 'result' });
    fal.control.stop = stop;
    const fetch = fakeFetch();
    const g = gateway({ clients: { fal: fal.client }, fetch: fetch.fetch });
    const err = await failure(g.video(video(operation)));
    expect(err.message).toMatch(/^fal made the clip and billed it \(its cost is recorded\), but its run was ending/);
    expect(fal.cancels).toEqual([]);
    expect(fetch.requested).toEqual([]);
    expect(ledger()).toHaveLength(1);
  });

  it('submits nothing when the stop came first', async () => {
    const { stop, operation } = caller('run-1/clip/video/abc/1');
    stop.abort();
    const fal = heldFal({ status: 'removed', detail: 'not asked' });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    expect(await failure(g.video(video(operation)))).toMatchObject({ billing: 'none', billed: false });
    expect(fal.submitted).toEqual([]);
    expect(await g.spend('ws')).toMatchObject({ inFlightUsd: 0, uncertainUsd: 0 });
  });

  it('after the clip is kept, submits no last-frame job: the clip is settled as made and kept', async () => {
    const { stop, operation } = caller('run-1/clip/video/abc/1');
    const fal = heldFal({ status: 'failed', detail: 'not asked' }, { stopAt: 'result' });
    // The stop comes while the clip downloads, after its job finished and was read.
    fal.client.queue.result = async () => ({ data: { video: { url: 'https://v3.fal.media/files/clip.mp4' } }, requestId: 'req-1' });
    const fetch = fakeFetch();
    const download = fetch.fetch;
    const g = gateway({
      clients: { fal: fal.client },
      fetch: async (input, init) => {
        stop.abort();
        return download(input, init);
      },
    });
    const err = await failure(g.video(video(operation)));
    expect(err.message).toMatch(/^fal made the clip and billed it \(its cost is recorded\), but its run was ending, so byway made no last frame for it \(the clip is kept as sha256:[0-9a-f]{64}\)\.$/);
    expect(fal.submitted).toEqual([BALANCED_VIDEO]);
    expect(fal.submitted).not.toContain(FAL_EXTRACT_FRAME);
    expect(ledger()).toHaveLength(1);
  });
});

describe('fal’s queue cancel over REST', () => {
  const answer = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const fetchWith = (res: () => Promise<Response>) => (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), init });
    return res();
  }) as typeof fetch;
  beforeEach(() => {
    sent.length = 0;
  });

  it('addresses the job under fal’s app id, with PUT, the key, and no redirect followed', async () => {
    expect(falAppId(BALANCED_VIDEO)).toBe('fal-ai/kling-video');
    expect(falAppId('workflows/someone/flow/run')).toBe('workflows/someone/flow');
    expect(await cancelJob(fetchWith(answer(200, { status: 'OK' })), KEYS.FAL_KEY, BALANCED_VIDEO, 'req-1')).toEqual({ status: 'removed', detail: 'HTTP 200 OK' });
    expect(sent[0]?.url).toBe('https://queue.fal.run/fal-ai/kling-video/requests/req-1/cancel');
    expect(sent[0]?.init).toMatchObject({ method: 'PUT', redirect: 'error', headers: { Authorization: `Key ${KEYS.FAL_KEY}` } });
  });

  it('reads each of fal’s answers, and never throws', async () => {
    const key = KEYS.FAL_KEY;
    expect((await cancelJob(fetchWith(answer(202, { status: 'CANCELLATION_REQUESTED' })), key, BALANCED_VIDEO, 'r')).status).toBe('requested');
    expect((await cancelJob(fetchWith(answer(400, { status: 'ALREADY_COMPLETED' })), key, BALANCED_VIDEO, 'r')).status).toBe('completed');
    expect(await cancelJob(fetchWith(answer(404, { status: 'NOT_FOUND' })), key, BALANCED_VIDEO, 'r')).toEqual({ status: 'failed', detail: 'HTTP 404 NOT_FOUND' });
    // A 400 that is not "already completed", and a 200 that does not say OK, are not read as more than they say.
    expect((await cancelJob(fetchWith(answer(400, { detail: 'bad' })), key, BALANCED_VIDEO, 'r')).status).toBe('failed');
    expect((await cancelJob(fetchWith(answer(200, { status: 'IN_PROGRESS' })), key, BALANCED_VIDEO, 'r')).status).toBe('failed');
    const lost = await cancelJob(fetchWith(() => Promise.reject(new TypeError('fetch failed'))), key, BALANCED_VIDEO, 'r');
    expect(lost.status).toBe('failed');
    expect(lost.detail).toMatch(/^no answer: fetch failed/);
  });
});

describe('the cut-off error', () => {
  it('says how the call is counted, and is never retried', () => {
    const maybe = cutOffError('anthropic', 'maybe');
    expect(maybe).toMatchObject({ code: 'byway-failure', retryable: false, billing: 'maybe', cutOff: true });
    expect(maybe.billed).toBeUndefined();
    expect(cutOffError('fal', 'none')).toMatchObject({ billing: 'none', billed: false });
    expect(isCutOff(new GatewayError('byway-failure', 'x'))).toBe(false);
  });
});
