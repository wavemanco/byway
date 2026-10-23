/**
 * A call answered whole waits its model's wait in all (the waits design of 2026-10-22, section 2): a Google text call,
 * and every OpenAI and Google image. Each send is handed a deadline at the wait chosen in Settings' "How long to wait
 * for an answer" (text 15, 30, 45 or 60 minutes, images 5, 10, 15 or 20; 15 when none is chosen), which the adapter
 * hands the SDK. When it runs out the call ends plainly and is not sent again (the owner's "Give up and end the call
 * plainly (Recommended)"), counted as "may have been billed" with the reason 'waited'; other connection failures are
 * still sent once more. The deadline never carries the run's stop, so a Cancel leaves the call running (ADR-0111).
 * The real OpenAI and Google SDKs are driven too, through a fetch that answers only when its signal aborts: OpenAI's own
 * ten-minute timeout is raised above the wait, and Google's sends the deadline as its signal.
 *
 * Only setTimeout and clearTimeout are faked; nothing waits on the real clock.
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GenerateContentParameters } from '@google/genai';
import { GatewayError, type CompletionRequest, type ImageRequest } from '@byway/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGateway, type GatewayOptions, type ModelGateway } from '../src/gateway.ts';
import { MemorySpendBook } from '../src/memory-book.ts';
import { createGoogleClient, type GoogleClientLike, type GoogleResponseLike } from '../src/providers/google.ts';
import { createOpenAIClient, IMAGE_SDK_TIMEOUT_ABOVE_WAIT_MS, type ImagesResponseLike, type OpenAIClientLike } from '../src/providers/openai.ts';
import { MemoryArtifacts } from './fakes.ts';

/** Placeholders shaped like each provider's keys; none is a real key, and no test reaches a network. */
const KEYS = { OPENAI_API_KEY: 'sk-proj-test-not-a-real-key-000000', GEMINI_API_KEY: 'AIza-test-not-a-real-key-000000' };
const MINUTE = 60_000;

let dir: string;
let book: MemorySpendBook;
let artifacts: MemoryArtifacts;
const open: ModelGateway[] = [];

beforeEach(async () => {
  for (const g of open.splice(0)) await g.close();
  dir = mkdtempSync(join(tmpdir(), 'byway-whole-call-'));
  book = new MemorySpendBook();
  artifacts = new MemoryArtifacts();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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
    now: () => new Date('2026-10-22T12:00:00Z'),
    ...over,
  });
  open.push(g);
  return g;
}

const ledger = (): unknown[] => (existsSync(join(dir, 'ledger.jsonl')) ? readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').filter(Boolean) : []);

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
  return { caps, asked, chosen };
}

/** A step's caller, with the stop its run's Cancel turns into. */
function caller(key = 'run-1/step/art/abc/1') {
  const stop = new AbortController();
  const until = new AbortController();
  return { stop, operation: { key, until: until.signal, cancel: stop.signal, stop: stop.signal } };
}

const failure = async (p: Promise<unknown>): Promise<GatewayError> => {
  const e = await p.then(
    () => undefined,
    (err: unknown) => err,
  );
  if (!(e instanceof GatewayError)) throw new Error(`expected a GatewayError, got ${String(e)}`);
  return e;
};

/** Rejects as fetch does once `signal` aborts. */
const abortedWith = (signal: AbortSignal | undefined): Promise<never> =>
  new Promise((_, reject) => {
    if (!signal) return reject(new Error('the call was given no signal'));
    const fail = () => reject(new DOMException('This operation was aborted', 'AbortError'));
    if (signal.aborted) return fail();
    signal.addEventListener('abort', fail, { once: true });
  });

/** Sends as they begin: `started(n)` settles once the (n+1)th has. */
function sends<T>() {
  const seen: T[] = [];
  const waiting: { n: number; resolve: () => void }[] = [];
  return {
    seen,
    add(item: T) {
      seen.push(item);
      for (const w of waiting.filter((x) => seen.length > x.n)) w.resolve();
    },
    started: (n: number) => new Promise<void>((resolve) => (seen.length > n ? resolve() : waiting.push({ n, resolve }))),
  };
}

const TEXT = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Done.' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } } satisfies GoogleResponseLike;
const IMAGE = {
  candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { data: Buffer.from('jpeg-bytes').toString('base64'), mimeType: 'image/jpeg' } }] } }],
  usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 1290, candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1290 }] },
} satisfies GoogleResponseLike;
const PNG = { data: [{ b64_json: Buffer.from('png-bytes').toString('base64') }], output_format: 'png', usage: { input_tokens: 20, output_tokens: 4000 } } satisfies ImagesResponseLike;

/**
 * A Google client whose calls are answered by `answer(n, signal)`: by default each is held until its abort signal
 * aborts, then rejected as the SDK's fetch rejects. Each send's params and signal are kept.
 */
function heldGoogle(answer: (n: number, signal: AbortSignal | undefined) => Promise<GoogleResponseLike> = (_n, signal) => abortedWith(signal)) {
  const s = sends<{ params: GenerateContentParameters; signal: AbortSignal | undefined }>();
  const client: GoogleClientLike = {
    models: {
      generateContent(params) {
        const signal = params.config?.abortSignal;
        s.add({ params, signal });
        return answer(s.seen.length, signal);
      },
    },
  };
  return { client, ...s };
}

/** An OpenAI client whose images are answered by `answer` (held until their signal aborts by default); chat is unused. */
function heldOpenAIImages(answer: (n: number, signal: AbortSignal | undefined) => Promise<ImagesResponseLike> = (_n, signal) => abortedWith(signal)) {
  const s = sends<{ signal: AbortSignal | undefined; timeout: number | undefined }>();
  const client: OpenAIClientLike = {
    chat: { completions: { create: () => Promise.reject(new Error('not used')) } },
    images: {
      generate(_body, options) {
        s.add({ signal: options?.signal, timeout: options?.timeout });
        return answer(s.seen.length, options?.signal);
      },
    },
  };
  return { client, ...s };
}

const askGoogle = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  workspaceId: 'ws',
  runId: 'run-1',
  stepId: 'draft',
  purpose: 'build:prose',
  profileId: 'google',
  tier: 'mid',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Write it.' }] }],
  maxOutputTokens: 1000,
  ...over,
});

const askImage = (profileId: 'google' | 'openai', over: Partial<ImageRequest> = {}): ImageRequest => ({
  workspaceId: 'ws',
  runId: 'run-1',
  stepId: 'art',
  purpose: 'asset:web-page',
  profileId,
  prompt: 'A loaf at dawn',
  size: '1024x1024',
  ...over,
});

/** The words a call answered whole fails with once its wait ran out (the waits design, section 7). */
const notAnswered = (model: string, minutes: number): string =>
  `${model} did not answer within ${minutes} minutes, the wait chosen in Settings, so byway stopped waiting. It may have billed the work. To wait longer, change 'How long to wait for an answer' in Settings.`;

type Kind = 'google text' | 'google image' | 'openai image';
const MODEL: Record<Kind, { ref: string; name: string }> = {
  'google text': { ref: 'google/gemini-3.8-flash', name: 'Google’s model gemini-3.8-flash' },
  'google image': { ref: 'google/gemini-nano-banana-2.1', name: 'Google’s model gemini-nano-banana-2.1' },
  'openai image': { ref: 'openai/gpt-image-2.5-flare', name: 'OpenAI’s model gpt-image-2.5-flare' },
};

/** A call of `kind` whose provider never answers, on a gateway with `over`: its sends, and the call's outcome. */
function heldCall(kind: Kind, over: Partial<GatewayOptions>, operation?: CompletionRequest['operation']) {
  if (kind === 'openai image') {
    const fake = heldOpenAIImages();
    const g = gateway({ clients: { openai: fake.client }, ...over });
    return { g, fake, outcome: failure(g.image(askImage('openai', operation ? { operation } : {}))) };
  }
  const fake = heldGoogle();
  const g = gateway({ clients: { google: fake.client }, ...over });
  const outcome = kind === 'google text' ? failure(g.complete(askGoogle(operation ? { operation } : {}))) : failure(g.image(askImage('google', operation ? { operation } : {})));
  return { g, fake, outcome };
}

describe('a call answered whole waits its model’s wait in all, and is not sent again once it runs out', () => {
  // The owner's choices of 2026-10-22: text "15, 30, 45, and 60 minutes", default "15 minutes (Recommended)"; images
  // "5, 10, 15, 20; default 15 (Recommended)".
  it.each([
    ...[undefined, 15, 30, 45, 60].map((m) => ['google text', m] as const),
    ...[undefined, 5, 10, 15, 20].map((m) => ['google image', m] as const),
    ...[undefined, 5, 10, 15, 20].map((m) => ['openai image', m] as const),
  ])('%s: aborted at its model’s wait (%s minutes; none chosen: 15) and not a moment before, ended plainly, counted as waited', async (kind, chosen) => {
    const minutes = chosen ?? 15;
    const waits = waitsOf({ [MODEL[kind].ref]: chosen });
    const { g, fake, outcome } = heldCall(kind, { caps: waits.caps });
    await fake.started(0);
    await vi.advanceTimersByTimeAsync(minutes * MINUTE - 1);
    expect(fake.seen.map((x) => x.signal?.aborted)).toEqual([false]);
    await vi.advanceTimersByTimeAsync(1);
    const err = await outcome;
    expect(err).toMatchObject({ code: 'provider-error', retryable: false, billing: 'maybe', message: notAnswered(MODEL[kind].name, minutes), waited: { minutes, how: 'answer' } });
    // Not sent again, whatever the time: one send, aborted at the wait.
    await vi.advanceTimersByTimeAsync(minutes * MINUTE);
    expect(fake.seen.map((x) => x.signal?.aborted)).toEqual([true]);
    expect(ledger()).toEqual([]);
    const listed = (await g.spendRecords('ws')).uncertain;
    expect(listed).toEqual([expect.objectContaining({ reason: 'waited', waited: { minutes, how: 'answer' } })]);
    expect((await g.spend('ws')).uncertainUsd).toBe(listed[0]?.usd);
    // Read once, before the call, for its own model (as the budgets are read on every call).
    expect(waits.asked).toEqual([MODEL[kind].ref]);
  });

  it.each([
    ['google text', 5, 15],
    ['google text', 75, 15],
    ['google image', 30, 15],
    ['openai image', 45, 15],
  ] as const)('%s: a choice its kind does not offer (%s minutes) is not used: it waits its kind’s default', async (kind, chosen, minutes) => {
    const { fake, outcome } = heldCall(kind, { caps: waitsOf({ [MODEL[kind].ref]: chosen }).caps });
    await fake.started(0);
    await vi.advanceTimersByTimeAsync(minutes * MINUTE - 1);
    expect(fake.seen[0]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toMatchObject({ waited: { minutes, how: 'answer' } });
  });

  it('google text: a relay step’s wait (operation.waitMs) is the one kept, and Settings is not read', async () => {
    const waits = waitsOf({ [MODEL['google text'].ref]: 60 });
    const { fake, outcome } = heldCall('google text', { caps: waits.caps }, { ...caller().operation, waitMs: 30 * MINUTE });
    await fake.started(0);
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    expect(await outcome).toMatchObject({ waited: { minutes: 30, how: 'answer' } });
    expect(waits.asked).toEqual([]);
  });

  it('a changed image wait applies from the next call', async () => {
    const waits = waitsOf({ [MODEL['openai image'].ref]: 5 });
    const fake = heldOpenAIImages();
    const g = gateway({ clients: { openai: fake.client }, caps: waits.caps });
    const first = failure(g.image(askImage('openai')));
    await fake.started(0);
    waits.chosen[MODEL['openai image'].ref] = 20;
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(await first).toMatchObject({ waited: { minutes: 5 } });
    const second = failure(g.image(askImage('openai')));
    await fake.started(1);
    await vi.advanceTimersByTimeAsync(20 * MINUTE - 1);
    expect(fake.seen[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await second).toMatchObject({ waited: { minutes: 20 } });
  });

  it.each(['google image', 'openai image'] as const)('%s: the one retry after a decline reads its wait again, as a call of its own, and waits it in all', async (kind) => {
    const waits = waitsOf({ [MODEL[kind].ref]: 10 });
    const declined = { candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }], usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 0 } } satisfies GoogleResponseLike;
    const fake =
      kind === 'google image'
        ? heldGoogle((n, signal) => (n === 1 ? Promise.resolve(declined) : abortedWith(signal)))
        : heldOpenAIImages((n, signal) => (n === 1 ? Promise.reject(Object.assign(new Error('blocked'), { status: 400, error: { code: 'moderation_blocked' } })) : abortedWith(signal)));
    const g = gateway({ clients: kind === 'google image' ? { google: fake.client as GoogleClientLike } : { openai: fake.client as OpenAIClientLike }, caps: waits.caps });
    const err = failure(g.image(askImage(kind === 'google image' ? 'google' : 'openai')));
    await fake.started(1);
    await vi.advanceTimersByTimeAsync(10 * MINUTE - 1);
    expect(fake.seen.map((x) => x.signal?.aborted)).toEqual([false, false]);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.seen.map((x) => x.signal?.aborted)).toEqual([false, true]);
    expect((await err).message).toMatch(/did not answer within 10 minutes/);
    expect(waits.asked).toEqual([MODEL[kind].ref, MODEL[kind].ref]);
  });

  it('google text: another connection failure is still sent once more, and the resend waits its whole wait again from its own send', async () => {
    const reset = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) });
    const fake = heldGoogle((n, signal) => (n === 1 ? new Promise((_, reject) => setTimeout(() => reject(reset()), 9 * MINUTE)) : abortedWith(signal)));
    const g = gateway({ clients: { google: fake.client } });
    const reserved: number[] = [];
    const admit = book.admit.bind(book);
    book.admit = async (req) => (reserved.push(req.reserveUsd), admit(req));
    const err = failure(g.complete(askGoogle()));
    await fake.started(0);
    await vi.advanceTimersByTimeAsync(9 * MINUTE);
    await fake.started(1);
    // The first send's deadline ended with it; the resend's counts from its own send, 15 minutes.
    await vi.advanceTimersByTimeAsync(15 * MINUTE - 1);
    expect(fake.seen.map((x) => x.signal?.aborted)).toEqual([false, false]);
    await vi.advanceTimersByTimeAsync(1);
    expect(await err).toMatchObject({ waited: { minutes: 15, how: 'answer' } });
    expect(fake.seen).toHaveLength(2);
    // The first send was retained before the resend, as for any send that may have been billed (ADR-0095): the call is
    // counted at its reservation twice, and listed once, as waited.
    const estimate = reserved[0] ?? Number.NaN;
    expect(reserved).toHaveLength(1);
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ reason: 'waited', usd: 2 * estimate })]);
    expect((await g.spend('ws')).uncertainUsd).toBeCloseTo(2 * estimate, 10);
  });
});

describe('the deadline never carries the run’s stop: a Cancel leaves the call running (ADR-0111; the waits design, section 5)', () => {
  it.each(['google text', 'google image', 'openai image'] as const)('%s: the stop leaves its signal alone, and its answer is settled at its true cost', async (kind) => {
    const { stop, operation } = caller();
    let answer: (() => void) | undefined;
    const held = <T>(value: T) => new Promise<T>((resolve) => (answer = () => resolve(value)));
    let result: Promise<{ costUsd: number }>;
    let seen: { signal: AbortSignal | undefined }[];
    let started: (n: number) => Promise<void>;
    if (kind === 'openai image') {
      const fake = heldOpenAIImages(() => held(PNG));
      ({ seen, started } = fake);
      result = gateway({ clients: { openai: fake.client } }).image(askImage('openai', { operation }));
    } else {
      const fake = heldGoogle(() => held(kind === 'google text' ? TEXT : IMAGE));
      ({ seen, started } = fake);
      const g = gateway({ clients: { google: fake.client } });
      result = kind === 'google text' ? g.complete(askGoogle({ operation })) : g.image(askImage('google', { operation }));
    }
    await started(0);
    stop.abort();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(seen[0]?.signal).toBeDefined();
    expect(seen[0]?.signal).not.toBe(stop.signal);
    expect(seen[0]?.signal?.aborted).toBe(false);
    answer?.();
    expect((await result).costUsd).toBeGreaterThan(0);
    expect(ledger()).toHaveLength(1);
    // The request as recorded is the request: the signal the SDK was handed is not part of it.
    expect(artifacts.allText()).toContain('"model":');
    expect(artifacts.allText()).not.toContain('abortSignal');
  });
});

describe('the real SDKs keep the wait', () => {
  /** A fetch that answers only when its signal aborts, as a provider that has not answered yet; its sends are kept. */
  function hangingFetch() {
    const s = sends<{ url: string; signal: AbortSignal | undefined }>();
    const fetchImpl: typeof fetch = (input, init) => {
      s.add({ url: String(input), signal: init?.signal ?? undefined });
      return abortedWith(init?.signal ?? undefined);
    };
    return { fetchImpl, ...s };
  }

  it('openai: the SDK’s own ten-minute timeout no longer cuts an image off; the image’s wait does, with the SDK’s raised above it', async () => {
    const http = hangingFetch();
    const g = gateway({ clients: { openai: createOpenAIClient(KEYS.OPENAI_API_KEY, http.fetchImpl) }, caps: waitsOf({ [MODEL['openai image'].ref]: 20 }).caps });
    const err = failure(g.image(askImage('openai')));
    await http.started(0);
    expect(http.seen[0]?.url).toBe('https://api.openai.com/v1/images/generations');
    // Past the SDK's own ten minutes, and up to the wait, the request is still open.
    await vi.advanceTimersByTimeAsync(20 * MINUTE - 1);
    expect(http.seen.map((x) => x.signal?.aborted)).toEqual([false]);
    await vi.advanceTimersByTimeAsync(1);
    expect(await err).toMatchObject({ waited: { minutes: 20, how: 'answer' }, retryable: false });
    expect(http.seen.map((x) => x.signal?.aborted)).toEqual([true]);
    expect(IMAGE_SDK_TIMEOUT_ABOVE_WAIT_MS).toBeGreaterThan(0);
  });

  it('openai: the image request’s own SDK timeout is its wait and a minute', async () => {
    const fake = heldOpenAIImages();
    const err = failure(gateway({ clients: { openai: fake.client }, caps: waitsOf({ [MODEL['openai image'].ref]: 5 }).caps }).image(askImage('openai')));
    await fake.started(0);
    expect(fake.seen[0]?.timeout).toBe(5 * MINUTE + IMAGE_SDK_TIMEOUT_ABOVE_WAIT_MS);
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    await err;
  });

  it.each([
    ['text', (g: ModelGateway) => g.complete(askGoogle()), 45, 'google/gemini-3.8-flash'],
    ['an image', (g: ModelGateway) => g.image(askImage('google')), 20, 'google/gemini-nano-banana-2.1'],
  ] as const)('google %s: the SDK sends the call with its deadline as its signal, and nothing cuts it off before the wait', async (_what, call, minutes, ref) => {
    const http = hangingFetch();
    const g = gateway({ clients: { google: createGoogleClient(KEYS.GEMINI_API_KEY, http.fetchImpl) }, caps: waitsOf({ [ref]: minutes }).caps });
    const err = failure(call(g));
    await http.started(0);
    expect(http.seen[0]?.url).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\//);
    await vi.advanceTimersByTimeAsync(minutes * MINUTE - 1);
    expect(http.seen.map((x) => x.signal?.aborted)).toEqual([false]);
    await vi.advanceTimersByTimeAsync(1);
    expect(await err).toMatchObject({ waited: { minutes, how: 'answer' }, retryable: false });
    expect(http.seen).toHaveLength(1);
  });
});
