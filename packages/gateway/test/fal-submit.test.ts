import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GatewayError, type VideoRequest } from '@byway/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { billingOf } from '../src/errors.ts';
import { createGateway } from '../src/gateway.ts';
import { encodePng } from '../src/mock/png.ts';
import { createFalClient, FAL_EXTRACT_FRAME, FalQueueError, type FalClientLike } from '../src/providers/fal.ts';
import { fakeFal, fakeFetch, fetchFailed, MemoryArtifacts } from './fakes.ts';
import { memorySpendBook } from '../src/memory-book.ts';

/**
 * F03: every fal queue job is submitted once over fal's REST queue API, outside @fal-ai/client, whose queue.submit
 * re-sends a job up to three times on 429, 502, 503, 504 and network errors whatever the client's own retry setting
 * (queue.js QUEUE_RETRY_CONFIG overrides it in request.js). Status, result and the upload stay on the SDK. Everything
 * here runs against a fake fetch; the global fetch is replaced too, so nothing can reach the network.
 */

/** Shaped like a fal key (key id, a colon, the secret), and not a real one. */
const FAL_KEY = '0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6:00112233445566778899aabbccddeeff';
const MODEL = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
const QUEUE = 'https://queue.fal.run';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/**
 * fal over HTTP: the storage upload, the queue (submit, status, result) and the media host. `submits` plans the answer
 * to each POST to the queue, per endpoint, in order (then accepted); `results` plans the answer to each read of a job's
 * result, per request id, in order (then its media); every POST is recorded.
 */
function fakeFalHttp(submits: Record<string, (Response | Error)[]> = {}, results: Record<string, (() => Response)[]> = {}) {
  const media = fakeFetch();
  const posts: { url: string; auth: string | null; body: unknown }[] = [];
  const reads: string[] = [];
  let next = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.startsWith('https://rest.fal.ai/storage/upload/initiate')) return json({ upload_url: 'https://v3.fal.media/upload/slot-1', file_url: 'https://v3.fal.media/files/upload-0.png' });
    if (url === 'https://v3.fal.media/upload/slot-1' && method === 'PUT') return new Response(null, { status: 200 });
    if (url.startsWith(`${QUEUE}/`) && method === 'POST') {
      const endpoint = url.slice(QUEUE.length + 1);
      posts.push({ url, auth: new Headers(init?.headers).get('authorization'), body: JSON.parse(String(init?.body)) });
      const planned = submits[endpoint]?.shift();
      if (planned instanceof Error) throw planned;
      if (planned) return planned;
      next += 1;
      return json({ request_id: `req-${next}`, status_url: `${url}/requests/req-${next}/status` });
    }
    if (url.startsWith(`${QUEUE}/`) && method === 'GET') {
      reads.push(url);
      const path = new URL(url).pathname;
      if (path.endsWith('/status')) return json({ status: 'COMPLETED' });
      const id = path.split('/').at(-1) as string;
      const planned = results[id]?.shift();
      if (planned) return planned();
      const data = path.startsWith('/fal-ai/ffmpeg-api/')
        ? { images: [{ url: 'https://v3.fal.media/files/last.png', content_type: 'image/png' }] }
        : { video: { url: 'https://v3.fal.media/files/clip.mp4', content_type: 'video/mp4' } };
      return json(data, 200, { 'x-fal-request-id': id });
    }
    return media.fetch(input, init);
  };
  return { fetch: fetch as typeof globalThis.fetch, posts, reads };
}

let dir: string;
let artifacts: MemoryArtifacts;
let startFrame: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'byway-fal-'));
  artifacts = new MemoryArtifacts();
  startFrame = (await artifacts.put(encodePng(4, 2, new Uint8Array(24).fill(200)), 'image/png')).id;
  vi.stubGlobal('fetch', async () => {
    throw new Error('the global fetch was called: tests must not reach the network');
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const req = (over: Partial<VideoRequest> = {}): VideoRequest => ({
  workspaceId: 'ws-1',
  runId: 'run-1',
  stepId: 'clip',
  purpose: 'relay:media',
  profileId: 'balanced',
  prompt: 'Shot 2: the runner crests the ridge at dawn',
  startFrameArtifactId: startFrame,
  durationSec: 5,
  ...over,
});

function gateway(http: ReturnType<typeof fakeFalHttp>) {
  return createGateway({
    ledgerPath: join(dir, 'ledger.jsonl'),
    spendBook: memorySpendBook(),
    artifacts,
    caps: { workspaceCapUsd: () => 100 },
    env: { FAL_KEY },
    fetch: http.fetch,
    retry: { sleep: async () => {}, random: () => 0.5 },
    now: () => new Date('2026-10-07T12:00:00Z'),
  });
}

const ledgerLines = () => readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);

describe('createFalClient: a job is submitted with one HTTP request (F03)', () => {
  it('posts the input once to the queue with the key header, and returns the request id', async () => {
    const http = fakeFalHttp();
    const res = await createFalClient(FAL_KEY, http.fetch).queue.submit(MODEL, { input: { prompt: 'p', duration: '5' } });
    expect(res).toEqual({ request_id: 'req-1' });
    expect(http.posts).toEqual([{ url: `${QUEUE}/${MODEL}`, auth: `Key ${FAL_KEY}`, body: { prompt: 'p', duration: '5' } }]);
  });

  it.each([
    ["503 with fal's error body", () => json({ detail: 'Service temporarily unavailable' }, 503), 'none'],
    ['502 from a gateway in between', () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }), 'maybe'],
    ['504', () => json({ detail: 'Gateway Timeout' }, 504), 'maybe'],
    ['200 without a request id', () => json({ status: 'IN_QUEUE' }), 'maybe'],
  ] as const)('sends nothing again itself on %s, and reports what it may have cost (%s)', async (_label, answer, billing) => {
    const http = fakeFalHttp({ [MODEL]: [answer()] });
    const err = await createFalClient(FAL_KEY, http.fetch).queue.submit(MODEL, { input: { prompt: 'p' } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(billingOf(err)).toBe(billing);
    expect(http.posts).toHaveLength(1);
  });

  it('sends nothing again itself after a reset, which may have reached fal', async () => {
    const http = fakeFalHttp({ [MODEL]: [fetchFailed('ECONNRESET')] });
    const err = await createFalClient(FAL_KEY, http.fetch).queue.submit(MODEL, { input: { prompt: 'p' } }).catch((e: unknown) => e);
    expect(billingOf(err)).toBe('maybe');
    expect(http.posts).toHaveLength(1);
  });

  it("keeps fal's error body on the error and refuses an endpoint id that is not one", async () => {
    const http = fakeFalHttp({ [MODEL]: [json({ detail: 'prompt: field required' }, 422)] });
    const err = (await createFalClient(FAL_KEY, http.fetch).queue.submit(MODEL, { input: {} }).catch((e: unknown) => e)) as FalQueueError;
    expect(err).toBeInstanceOf(FalQueueError);
    expect([err.status, err.body, err.message]).toEqual([422, { detail: 'prompt: field required' }, 'HTTP 422: prompt: field required']);
    await expect(createFalClient(FAL_KEY, http.fetch).queue.submit('https://elsewhere.example/x', { input: {} })).rejects.toMatchObject({ code: 'invalid-request' });
    expect(http.posts).toHaveLength(1);
  });
});

describe('createFalClient: the start frame is uploaded only to fal’s media host, its redirects not followed (F17 (a), ADR-0088)', () => {
  /** fal's REST API answering the slot request with `uploadUrl`; every other request is recorded and answered 200. */
  function slotAt(uploadUrl: string) {
    const sent: { url: string; method: string; redirect: RequestInit['redirect'] }[] = [];
    const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://rest.fal.ai/storage/upload/initiate')) return json({ upload_url: uploadUrl, file_url: 'https://v3.fal.media/files/upload-0.png' });
      sent.push({ url, method: (init?.method ?? 'GET').toUpperCase(), redirect: init?.redirect });
      return new Response(null, { status: 200 });
    };
    return { fetch: fetch as typeof globalThis.fetch, sent };
  }
  const frame = () => new Blob([Buffer.from(encodePng(2, 2, new Uint8Array(12).fill(9)))], { type: 'image/png' });

  it('a slot on fal’s media host: one PUT there, redirects refused, and the file’s URL returned', async () => {
    const http = slotAt('https://v3b.fal.media/files/upload/slot-1?token=t');
    expect(await createFalClient(FAL_KEY, http.fetch).storage.upload(frame())).toBe('https://v3.fal.media/files/upload-0.png');
    expect(http.sent).toEqual([{ url: 'https://v3b.fal.media/files/upload/slot-1?token=t', method: 'PUT', redirect: 'error' }]);
  });

  it.each([
    ['another host', 'https://uploads.example/slot-1', 'https://uploads.example'],
    ['plain http', 'http://v3.fal.media/slot-1', 'http://v3.fal.media'],
    ['another port', 'https://v3.fal.media:8443/slot-1', 'https://v3.fal.media:8443'],
    ['user info', 'https://me:pw@v3.fal.media/slot-1', 'https://v3.fal.media'],
    ['a look-alike host', 'https://fal.media.example/slot-1', 'https://fal.media.example'],
  ])('a slot at %s is refused, and the frame is sent nowhere', async (_what, uploadUrl, origin) => {
    const http = slotAt(uploadUrl);
    const err = await createFalClient(FAL_KEY, http.fetch).storage.upload(frame()).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'provider-error', message: `fal named an upload address for the start frame outside its media host (${origin})` });
    expect(http.sent).toEqual([]);
  });
});

describe('gateway: a relay link over fal HTTP, the SDK reading status and results (F03)', () => {
  it('submits each job once, reads its status and result through the SDK, and ledgers the clip', async () => {
    const http = fakeFalHttp();
    const res = await gateway(http).video(req());
    expect(http.posts.map((p) => p.url)).toEqual([`${QUEUE}/${MODEL}`, `${QUEUE}/${FAL_EXTRACT_FRAME}`, `${QUEUE}/${FAL_EXTRACT_FRAME}`]);
    expect(http.posts[0]?.body).toEqual({ prompt: req().prompt, image_url: 'https://v3.fal.media/files/upload-0.png', duration: '5' });
    expect(http.reads.map((u) => new URL(u).pathname)).toEqual([
      '/fal-ai/kling-video/requests/req-1/status',
      '/fal-ai/kling-video/requests/req-1',
      '/fal-ai/ffmpeg-api/requests/req-2/status',
      '/fal-ai/ffmpeg-api/requests/req-2',
      '/fal-ai/ffmpeg-api/requests/req-3/status',
      '/fal-ai/ffmpeg-api/requests/req-3',
    ]);
    expect(res).toMatchObject({ provider: 'fal', mediaType: 'video/mp4', costUsd: 0.354 });
    const [entry] = ledgerLines();
    const response = JSON.parse(await artifacts.getText(entry?.responseSha256 as string)) as { wire: { requestId: string; frame: { requestId: string }; middleFrame: { requestId: string } } };
    // The ids fal gave the jobs are the ones recorded.
    expect([response.wire.requestId, response.wire.frame.requestId, response.wire.middleFrame.requestId]).toEqual(['req-1', 'req-2', 'req-3']);
  });

  it("re-sends a submission refused with fal's own 503 body, and buys one clip", async () => {
    const http = fakeFalHttp({ [MODEL]: [json({ detail: 'Service temporarily unavailable' }, 503)] });
    await expect(gateway(http).video(req())).resolves.toMatchObject({ costUsd: 0.354 });
    expect(http.posts.map((p) => p.url)).toEqual([`${QUEUE}/${MODEL}`, `${QUEUE}/${MODEL}`, `${QUEUE}/${FAL_EXTRACT_FRAME}`, `${QUEUE}/${FAL_EXTRACT_FRAME}`]);
    expect(ledgerLines()).toHaveLength(1);
  });

  it.each([
    ['a 502', () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } })],
    ['a reset after the request was written', () => fetchFailed('ECONNRESET')],
  ])('submits the clip exactly once after %s and fails, not retryable, saying fal may have accepted it', async (_label, answer) => {
    const http = fakeFalHttp({ [MODEL]: [answer()] });
    const err = (await gateway(http).video(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toBeInstanceOf(GatewayError);
    expect(err).toMatchObject({ code: 'provider-error', retryable: false });
    expect(err.message).toMatch(/fal may have accepted the clip/);
    expect(err.message).not.toContain(FAL_KEY);
    expect(http.posts).toHaveLength(1);
    expect(http.reads).toEqual([]);
  });

  // fal's queue page (read 2026-10-22): "If the deadline is reached before any runner successfully starts processing,
  // the server returns `504 Gateway Timeout` with the header `X-Fal-Request-Timeout-Type: user` and no further retries
  // occur." Its pricing page: "If a request fails with an HTTP 500 or higher status code, no charge is incurred."
  it('a clip job fal dropped at its start deadline: the SDK hands on its 504 and timeout type, read once, as nothing billed', async () => {
    const http = fakeFalHttp({}, { 'req-1': [() => json({ detail: 'Request timed out' }, 504, { 'x-fal-request-timeout-type': 'user' })] });
    const g = gateway(http);
    const err = (await g.video(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toBeInstanceOf(GatewayError);
    expect(err).toMatchObject({ code: 'provider-error', retryable: false, billed: false });
    expect(billingOf(err)).toBe('none');
    expect(err.message).toBe(
      `fal.ai’s model ${MODEL} did not start clip job req-1 in time to finish within 30 minutes, the wait chosen in Settings, so fal dropped it at the start deadline byway set (25 minutes) and nothing was billed. To wait longer, change 'How long to wait for an answer' in Settings.`,
    );
    // Submitted once with its deadline, its result read once (neither the SDK nor byway reads it again), no frame job.
    expect(http.posts.map((p) => p.url)).toEqual([`${QUEUE}/${MODEL}`]);
    expect(http.reads.map((u) => new URL(u).pathname)).toEqual(['/fal-ai/kling-video/requests/req-1/status', '/fal-ai/kling-video/requests/req-1']);
    expect(await g.spendRecords('ws-1')).toMatchObject({ inFlight: [], uncertain: [] });
    expect(await g.spend('ws-1')).toMatchObject({ spentUsd: 0, inFlightUsd: 0, uncertainUsd: 0 });
  });
});

// MONEY-2, the check of fix/fx-landnow: F03 (g)'s cancel ("Yes, nothing is sent again after a cancel") was honoured by
// completions and images only. A clip attempt Temporal cancelled still sent its submission again after fal's 503,
// retried its reads, and submitted its last-frame and middle-frame jobs beside the attempt that took the call over.
describe('gateway: a clip attempt Temporal has cancelled sends nothing again (F03 (g))', () => {
  /** Temporal's cancel of the attempt (a heartbeat timeout, a lost worker), with no stop: the run goes on. */
  const timedOut = () => {
    const cancel = new AbortController();
    const until = new AbortController();
    const stop = new AbortController();
    return { cancel, operation: { key: 'run-1/run-1/clip/-/1/video/abc/1', until: until.signal, cancel: cancel.signal, stop: stop.signal } };
  };
  /** fal over HTTP as fakeFalHttp, with `before` run on each request first: it may cancel the attempt, or answer in fal's place. */
  const watched = (http: ReturnType<typeof fakeFalHttp>, before: (url: string, method: string) => Response | undefined) => ({
    ...http,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      return before(url, (init?.method ?? 'GET').toUpperCase()) ?? http.fetch(input, init);
    }) as typeof globalThis.fetch,
  });

  it('a submission fal refuses with its 503 as the attempt is cancelled is not sent again, and counts nothing', async () => {
    const { cancel, operation } = timedOut();
    const http = watched(fakeFalHttp({ [MODEL]: [json({ detail: 'Service temporarily unavailable' }, 503)] }), (url, method) => {
      if (method === 'POST' && url === `${QUEUE}/${MODEL}`) cancel.abort(new Error('TIMED_OUT'));
      return undefined;
    });
    const g = gateway(http);
    const err = (await g.video(req({ operation })).catch((e: unknown) => e)) as GatewayError;
    expect(err).toBeInstanceOf(GatewayError);
    expect(billingOf(err)).toBe('none');
    expect(http.posts.map((p) => p.url)).toEqual([`${QUEUE}/${MODEL}`]);
    expect(await g.spendRecords('ws-1')).toMatchObject({ inFlight: [], uncertain: [] });
    expect(await g.spend('ws-1')).toMatchObject({ spentUsd: 0, inFlightUsd: 0, uncertainUsd: 0 });
  });

  // R-MONEY-1, the re-check of fix/fx-landnow: refusing these frame jobs settled the clip without frames, and the next
  // attempt bought it again. The owner chose "Third round: frame jobs go on (Recommended)": while this attempt still holds
  // the call's row, the made clip's last-frame and middle-frame jobs are submitted, and the clip is completed and kept.
  it('a clip made as the attempt is cancelled, its row still held, has its last-frame and middle-frame jobs made: one clip, kept', async () => {
    const { cancel, operation } = timedOut();
    const http = watched(fakeFalHttp(), (url, method) => {
      // The clip's result is read: Temporal cancels the attempt as it arrives.
      if (method === 'GET' && new URL(url).pathname === '/fal-ai/kling-video/requests/req-1') cancel.abort(new Error('TIMED_OUT'));
      return undefined;
    });
    const g = gateway(http);
    const out = await g.video(req({ operation }));
    expect(cancel.signal.aborted).toBe(true);
    expect(out).toMatchObject({ provider: 'fal', mediaType: 'video/mp4', costUsd: 0.354, lastFrameArtifactId: expect.any(String), middleFrameArtifactId: expect.any(String) });
    expect(http.posts.map((p) => p.url)).toEqual([`${QUEUE}/${MODEL}`, `${QUEUE}/${FAL_EXTRACT_FRAME}`, `${QUEUE}/${FAL_EXTRACT_FRAME}`]);
    // Made and billed once: ledgered at the clip's price, with nothing counted as may have been billed.
    expect(ledgerLines()).toHaveLength(1);
    expect(ledgerLines()[0]).toMatchObject({ kind: 'video', costUsd: 0.354, id: out.ledgerEntryId });
    expect(await g.spendRecords('ws-1')).toMatchObject({ inFlight: [], uncertain: [] });
    expect(await g.spend('ws-1')).toMatchObject({ spentUsd: 0.354, inFlightUsd: 0, uncertainUsd: 0 });
  });

  // On the SDK's client fake, not over HTTP: the SDK retries a status read itself, and what is counted here is byway's
  // own reads of it, one per poll the adapter makes.
  it('a status poll that fails after the cancel is not polled again: the clip counts as may have been billed, with its id', async () => {
    const { cancel, operation } = timedOut();
    const fal = fakeFal({}, { pollFailures: { [MODEL]: [fetchFailed('ECONNRESET'), fetchFailed('ECONNRESET')] } });
    const client: FalClientLike = {
      ...fal.client,
      queue: {
        ...fal.client.queue,
        subscribeToStatus(endpoint, options) {
          cancel.abort(new Error('TIMED_OUT'));
          return fal.client.queue.subscribeToStatus(endpoint, options);
        },
      },
    };
    const g = createGateway({
      ledgerPath: join(dir, 'ledger.jsonl'),
      spendBook: memorySpendBook(),
      artifacts,
      caps: { workspaceCapUsd: () => 100 },
      env: { FAL_KEY },
      clients: { fal: client },
      fetch: fakeFetch().fetch,
      retry: { sleep: async () => {}, random: () => 0.5 },
    });
    const err = (await g.video(req({ operation })).catch((e: unknown) => e)) as GatewayError;
    expect(err).toBeInstanceOf(GatewayError);
    expect(err).toMatchObject({ retryable: false });
    expect(billingOf(err)).toBe('maybe');
    expect(fal.polls).toEqual(['req-1']);
    expect(fal.calls.map((c) => c.endpoint)).toEqual([MODEL]);
    expect((await g.spendRecords('ws-1')).uncertain).toEqual([expect.objectContaining({ provider: 'fal', providerJobs: { generation: 'req-1' } })]);
  });
});
