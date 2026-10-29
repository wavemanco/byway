import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GatewayError, type VideoRequest } from '@byway/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { billingOf } from '../src/errors.ts';
import { createGateway } from '../src/gateway.ts';
import { encodePng } from '../src/mock/png.ts';
import { createFalClient, FAL_EXTRACT_FRAME, FalQueueError } from '../src/providers/fal.ts';
import { fakeFetch, fetchFailed, MemoryArtifacts } from './fakes.ts';
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
