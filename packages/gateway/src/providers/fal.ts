import { createFalClient as createFalSdkClient } from '@fal-ai/client';
import { GatewayError } from '@byway/contracts';
import { cutOffError } from '../errors.ts';
import { plain, type MediaBytes, type ProviderAdapter, type ProviderVideo, type ProviderVideoRequest } from './types.ts';

/**
 * fal.ai video for C5 relay links (ADR-0069), through @fal-ai/client 1.10 (read from the package's own type
 * definitions and fal.ai's model pages, 2026-10-07):
 * - `storage.upload(blob)` puts the start frame on fal's CDN and returns its URL;
 * - the queue: a submission enqueues a job and returns its `request_id`, `queue.subscribeToStatus` polls until it is
 *   done, and `queue.result` returns `{ data, requestId }`. The client's `subscribe` is exactly these three calls; the
 *   adapter makes them itself so that a failed poll is retried by polling again, never by submitting (and paying for)
 *   a second clip. A clip takes minutes, so `run` (one HTTP request held open) is not used;
 * - the submission is the one billable step, and it is made once, over fal's REST queue API (submitJob below), not
 *   through the SDK: the SDK re-sends a submission up to three times on 429, 502, 503, 504 and network errors, whatever
 *   the client's own retry setting (ADR-0091). Only the gateway decides whether a submission is sent again, and it never
 *   is after a failure that may have reached fal;
 * - image-to-video models answer `{ video: { url, content_type } }` (fal's `I2VOutput`);
 * - `fal-ai/ffmpeg-api/extract-frame` with `frame_type: 'last'` answers `{ images: [{ url, content_type }] }`, so
 *   fal itself provides the last frame the next link starts from, and no local video decoder is needed.
 * Media URLs expire, so the gateway downloads and stores both at once, only from fal's media host and within a byte
 * cap (download, below; ADR-0088).
 *
 * A stop (ADR-0111: the call's run is ending) submits nothing more, and cancels the job under way over fal's REST queue
 * API (cancelJob below), whose answer says what the job did: removed before it ran, asked to stop while running, or
 * already done. The SDK's own cancel resolves the same way for the first two, so it is not used.
 */

/** The slice of the fal client the adapter uses, so tests inject a fake. */
export interface FalClientLike {
  storage: { upload(file: Blob): Promise<string> };
  queue: {
    submit(endpointId: string, options: { input: Record<string, unknown> }): Promise<{ request_id: string }>;
    subscribeToStatus(endpointId: string, options: { requestId: string; pollInterval?: number; abortSignal?: AbortSignal }): Promise<unknown>;
    result(endpointId: string, options: { requestId: string }): Promise<{ data: unknown; requestId: string }>;
    /** Cancels a job (cancelJob): what fal answered. Never throws. */
    cancel(endpointId: string, options: { requestId: string }): Promise<FalCancel>;
  };
}

/**
 * fal's answer to a cancel (fal.ai/docs/model-apis/model-endpoints/queue, read 2026-10-21): 200 `{"status": "OK"}`, the
 * job was in the queue and fal removed it, so it does not run ('removed'); 202 `{"status": "CANCELLATION_REQUESTED"}`,
 * the job is running and fal signalled its runner, and it can still complete ('requested'); 400
 * `{"status": "ALREADY_COMPLETED"}`, it finished first ('completed'). Anything else (404, another answer, no answer) is
 * 'failed', and `detail` says what came back.
 */
export interface FalCancel {
  status: 'removed' | 'requested' | 'completed' | 'failed';
  detail: string;
}

/** Clips take minutes; polling every two seconds is plenty. */
const POLL_INTERVAL_MS = 2000;

/** fal's last-frame endpoint (fal.ai/models/fal-ai/ffmpeg-api/extract-frame). */
export const FAL_EXTRACT_FRAME = 'fal-ai/ffmpeg-api/extract-frame';
/**
 * fal bills the extraction per compute second ($0.0002/s) and does not report the seconds to the client, so every
 * call is charged this upper bound: a frame grab from a clip of a few seconds takes well under it.
 */
export const EXTRACT_FRAME_SECONDS_BOUND = 10;

/** How each supported image-to-video model names its inputs, and the clip lengths it makes. */
interface VideoModelSpec {
  imageField: 'image_url' | 'start_image_url';
  /** Lengths in seconds the model accepts, ascending. */
  durations: readonly number[];
  /** Fixed inputs. */
  extra?: Record<string, unknown>;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const FAL_VIDEO_MODELS: Readonly<Record<string, VideoModelSpec>> = {
  // fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video/api: image_url, duration "5" | "10".
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': { imageField: 'image_url', durations: [5, 10] },
  // fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video: start_image_url, duration "3".."15"; native audio is off
  // because C5 makes its voice-over in its own step from the locked script.
  'fal-ai/kling-video/v3/pro/image-to-video': { imageField: 'start_image_url', durations: range(3, 15), extra: { generate_audio: false } },
};

/** The nearest length the model makes (ties go up: a beat too long is easier to cut than one too short). */
export function falVideoSeconds(model: string, requestedSec: number): number {
  const spec = FAL_VIDEO_MODELS[model];
  if (!spec) return Math.max(1, Math.ceil(requestedSec));
  let best = spec.durations[0] as number;
  for (const d of spec.durations) if (Math.abs(d - requestedSec) <= Math.abs(best - requestedSec)) best = d;
  return best;
}

/** fal's queue API (docs.fal.ai/model-endpoints/queue): `POST <base>/<endpoint id>` enqueues a job. */
export const FAL_QUEUE_URL = 'https://queue.fal.run';
/** A submission is answered at once with the job's id; a minute without an answer is a lost answer, not a slow one. */
const SUBMIT_TIMEOUT_MS = 60_000;
/** Endpoint ids as byway uses them: owner, then path segments (fal-ai/kling-video/v3/pro/image-to-video). */
const ENDPOINT_ID = /^[a-z0-9-]+(?:\/[a-z0-9._-]+)+$/i;

/**
 * An answer from fal's queue that is not a success: its HTTP status and, when fal sent one, its JSON error body, which
 * is how billingOf tells fal's own refusal (nothing was enqueued) from a proxy's 5xx page (it may have been).
 */
export class FalQueueError extends Error {
  override name = 'FalQueueError';
  readonly status: number;
  readonly body: Record<string, unknown> | undefined;
  constructor(status: number, body: Record<string, unknown> | undefined, text: string) {
    const detail = typeof body?.detail === 'string' ? body.detail : typeof body?.message === 'string' ? body.message : text.slice(0, 300);
    super(`HTTP ${status}${detail ? `: ${detail}` : ''}`);
    this.status = status;
    this.body = body;
  }
}

/**
 * Enqueues one fal job: a single HTTP request, never repeated here (see the header). A redirect is refused rather than
 * followed with the key. An answer without a request id is an error that may have been billed: fal may have enqueued
 * the job and only the answer was lost.
 */
export async function submitJob(fetchImpl: typeof fetch, key: string, endpointId: string, input: Record<string, unknown>): Promise<{ request_id: string }> {
  if (!ENDPOINT_ID.test(endpointId)) throw new GatewayError('invalid-request', `"${endpointId}" is not a fal endpoint id`);
  const res = await fetchImpl(`${FAL_QUEUE_URL}/${endpointId}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
    redirect: 'error',
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  const json = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
  if (!res.ok) throw new FalQueueError(res.status, json, text);
  const id = json?.request_id;
  if (typeof id !== 'string' || !id) throw Object.assign(new Error(`fal answered the submission (HTTP ${res.status}) without a request id`), { billing: 'maybe' as const });
  return { request_id: id };
}

/** A cancel is answered at once; this bounds a lost answer. */
const CANCEL_TIMEOUT_MS = 30_000;
/** Endpoint namespaces whose app id has three parts, as the SDK reads them (parseEndpointId). */
const NAMESPACES = new Set(['workflows', 'comfy']);

/**
 * fal's app id for an endpoint: queue requests are addressed under it (`<owner>/<alias>/requests/<id>`), not under the
 * whole endpoint path a job is submitted to, as the SDK's own status, result and cancel calls build them.
 */
export function falAppId(endpointId: string): string {
  const parts = endpointId.split('/');
  return (NAMESPACES.has(parts[0] ?? '') ? parts.slice(0, 3) : parts.slice(0, 2)).join('/');
}

/**
 * Cancels one fal job: `PUT <queue>/<app id>/requests/<request id>/cancel`, sent once, with no redirect followed (the
 * key goes nowhere else), and read for what fal said (FalCancel). It never throws: a cancel that fails leaves the job as
 * it was, which the caller counts as "may have been billed".
 */
export async function cancelJob(fetchImpl: typeof fetch, key: string, endpointId: string, requestId: string): Promise<FalCancel> {
  if (!ENDPOINT_ID.test(endpointId)) return { status: 'failed', detail: `"${endpointId}" is not a fal endpoint id` };
  let res: Response;
  try {
    res = await fetchImpl(`${FAL_QUEUE_URL}/${falAppId(endpointId)}/requests/${encodeURIComponent(requestId)}/cancel`, {
      method: 'PUT',
      headers: { Authorization: `Key ${key}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS),
    });
  } catch (e) {
    return { status: 'failed', detail: `no answer: ${(e as Error)?.message ?? String(e)}`.slice(0, 300) };
  }
  const text = await res.text().catch(() => '');
  let status: unknown;
  try {
    status = (JSON.parse(text) as { status?: unknown } | null)?.status;
  } catch {
    status = undefined;
  }
  const said = `HTTP ${res.status}${typeof status === 'string' ? ` ${status}` : ''}`;
  if (res.status === 200 && status === 'OK') return { status: 'removed', detail: said };
  if (res.status === 202) return { status: 'requested', detail: said };
  if (res.status === 400 && status === 'ALREADY_COMPLETED') return { status: 'completed', detail: said };
  return { status: 'failed', detail: said };
}

/**
 * The fal client: the job submission over fal's REST queue API (submitJob), and the SDK for the rest. The SDK's
 * retries cannot be switched off for its queue calls (each passes its own retry setting, which overrides the client's
 * `maxRetries: 0`), so it is given only free reads: status polls, results and the start-frame upload, which it may
 * repeat at no cost. `fetchImpl` serves both, so tests can fake fal end to end.
 */
export function createFalClient(key: string, fetchImpl: typeof fetch = fetch): FalClientLike {
  const client = createFalSdkClient({ credentials: key, retry: { maxRetries: 0 }, fetch: fetchImpl });
  return {
    storage: { upload: (file) => client.storage.upload(file) },
    queue: {
      submit: (endpointId, options) => submitJob(fetchImpl, key, endpointId, options.input),
      subscribeToStatus: (endpointId, options) => client.queue.subscribeToStatus(endpointId, options),
      result: (endpointId, options) => client.queue.result(endpointId, options),
      cancel: (endpointId, options) => cancelJob(fetchImpl, key, endpointId, options.requestId),
    },
  };
}

/**
 * Provider media trust (ADR-0088). The media URLs come from fal's answers, so they are fal's to name, but byway decides
 * where it connects and how much it reads:
 * - every URL fetched, the first and each redirect hop alike, must pass admitMediaUrl: https on the default port, no
 *   userinfo, and fal's media domain (fal.media or a subdomain). With TLS to that name on every hop, a loopback or LAN
 *   service cannot answer, so no address pinning is needed;
 * - redirects are followed by hand, at most MAX_REDIRECTS, under one deadline for the whole download;
 * - the bytes read are counted as they stream (decoded bytes, so a compressed body is bounded too), and reading stops
 *   at MAX_DOWNLOAD_BYTES; a declared Content-Length over it is refused before reading;
 * - a media host's HTTP status is a media failure ('provider-error', tried again only for 408, 429 and 5xx), never a
 *   provider-API status: a CDN 401 is not a missing key.
 */
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MAX_REDIRECTS = 3;
/** fal.media and its subdomains (v3.fal.media, v3b.fal.media). WHATWG parsing has already lowercased the host. */
const FAL_MEDIA_HOST = /^(?:[a-z0-9-]+[.])*fal[.]media$/;

/** Whether a media URL may be fetched (see above). Trailing dots, IP literals and other ports all fail. */
export function admitMediaUrl(u: URL): boolean {
  return u.protocol === 'https:' && u.username === '' && u.password === '' && u.port === '' && FAL_MEDIA_HOST.test(u.hostname);
}

/** Where a URL points, for messages: scheme and host only, never userinfo or path. */
const originOf = (u: URL) => `${u.protocol}//${u.host}`;

const mediaError = (message: string, retryable = false) => new GatewayError('provider-error', message, retryable);

const retryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

/**
 * The bytes a body yields, counted as they arrive: undefined (and the body cancelled) once they pass `cap`. Each chunk
 * is copied as it arrives into one resizable buffer, which reserves `cap` of address space and grows in place, so a
 * download holds about what it has read, never more than about the cap. (Gathering chunks and joining them at the end
 * held every chunk and the joined copy at once: about twice the cap for a download near it.) A declared length within
 * the cap sizes the buffer at the start; a body longer than declared (a Content-Length counts compressed bytes, the
 * reader yields decoded ones) grows it. The result is handed back as an ordinary fixed-length buffer.
 */
export async function readCapped(body: ReadableStream<Uint8Array> | null, cap: number, declared: number | undefined): Promise<Uint8Array | undefined> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const store = new ArrayBuffer(declared !== undefined && declared > 0 && declared <= cap ? declared : 0, { maxByteLength: cap });
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const at = total;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      return undefined;
    }
    if (total > store.byteLength) store.resize(total);
    new Uint8Array(store, at, value.byteLength).set(value);
  }
  return new Uint8Array(store.transferToFixedLength(total));
}

/** The clip's type from its bytes: MP4 (an ISO-BMFF `ftyp` box first) or WebM (the EBML magic); otherwise not a video. */
export function sniffVideoType(bytes: Uint8Array): 'video/mp4' | 'video/webm' | undefined {
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'video/mp4';
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm';
  return undefined;
}

/** One media download under the rules above. `via` lists the origin of every URL fetched, for the evidence. */
async function download(fetchImpl: typeof fetch, url: string, what: string): Promise<{ bytes: Uint8Array; via: string[] }> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw mediaError(`fal returned a ${what} URL that cannot be read`);
  }
  if (!admitMediaUrl(current)) throw mediaError(`fal returned a ${what} URL outside its media host (${originOf(current)})`);
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  const via: string[] = [];
  for (let redirects = 0; ; redirects++) {
    via.push(originOf(current));
    const res = await fetchImpl(current.href, { redirect: 'manual', signal });
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {});
      const location = res.headers.get('location');
      if (!location) throw mediaError(`fal's media host answered the ${what} with a redirect (HTTP ${res.status}) but no address`);
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw mediaError(`fal's media host redirected the ${what} to an address that cannot be read`);
      }
      if (!admitMediaUrl(next)) throw mediaError(`the ${what} download was redirected outside its media host (${originOf(next)})`);
      if (redirects >= MAX_REDIRECTS) throw mediaError(`the ${what} download was redirected more than ${MAX_REDIRECTS} times`);
      current = next;
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw mediaError(`downloading the ${what} failed with HTTP ${res.status}`, retryableStatus(res.status));
    }
    const length = res.headers.get('content-length');
    const declared = length !== null && /^\d+$/.test(length.trim()) ? Number(length) : undefined;
    if (declared !== undefined && declared > MAX_DOWNLOAD_BYTES) {
      await res.body?.cancel().catch(() => {});
      throw mediaError(`the ${what} is ${declared} bytes, over the ${MAX_DOWNLOAD_BYTES}-byte limit`);
    }
    const bytes = await readCapped(res.body, MAX_DOWNLOAD_BYTES, declared);
    if (!bytes) throw mediaError(`the ${what} is over the ${MAX_DOWNLOAD_BYTES}-byte limit`);
    if (bytes.byteLength === 0) throw mediaError(`fal returned an empty ${what}`);
    return { bytes, via };
  }
}

/** The image type from the bytes themselves: the frame is stored under what it is, whatever a header claims. */
export function sniffImageType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | undefined {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}

function fileUrl(data: unknown, key: 'video' | 'images'): { url: string; contentType?: string } {
  const d = data as { video?: { url?: unknown; content_type?: unknown }; images?: { url?: unknown; content_type?: unknown }[] } | null;
  const file = key === 'video' ? d?.video : d?.images?.[0];
  if (!file || typeof file.url !== 'string') throw new GatewayError('provider-error', `fal answered without a ${key === 'video' ? 'video' : 'frame image'} URL`);
  return { url: file.url, ...(typeof file.content_type === 'string' ? { contentType: file.content_type } : {}) };
}

export interface FalAdapterOptions {
  client: FalClientLike;
  /** Downloads generated media (tests pass a fake). */
  fetch?: typeof fetch;
}

/** The two jobs a relay link submits, by role: the clip, then its last frame. */
type JobRole = 'generation' | 'extract';
const JOB_WHAT: Record<JobRole, string> = { generation: 'the clip', extract: 'the last-frame job' };

/** A wait that a stop ended first (untilStopped). */
const STOPPED = Symbol('stopped');

/** `work`, or STOPPED once `stop` aborts (at once when it already has). What `work` does afterwards is ignored. */
async function untilStopped<T>(work: Promise<T>, stop: AbortSignal | undefined): Promise<T | typeof STOPPED> {
  if (!stop) return work;
  work.catch(() => undefined);
  if (stop.aborted) return STOPPED;
  let onAbort: (() => void) | undefined;
  const stopped = new Promise<typeof STOPPED>((resolve) => {
    onAbort = () => resolve(STOPPED);
    stop.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([work, stopped]);
  } finally {
    if (onAbort) stop.removeEventListener('abort', onAbort);
  }
}

/** A job polled until done and read; or, when a stop came first, whether fal had already finished it. */
type Polled = { data: unknown; requestId: string } | { stopped: 'running' | 'done'; requestId: string };

/**
 * A job fal accepted whose status or result could not be read, even after retries: fal may still finish it and bill it.
 * The error names the request id, so the job can be found in fal's dashboard (and resumed by a later version, which
 * keeps these ids: `falRequests`), and it is not retryable: retrying the call would submit, and pay for, a second job.
 */
function acceptedButUnread(e: unknown, role: JobRole, requestId: string): GatewayError & { falRequests: Partial<Record<JobRole, string>> } {
  const detail = e instanceof Error ? e.message : String(e);
  const err = new GatewayError(
    'provider-error',
    `fal accepted ${JOB_WHAT[role]} (request ${requestId}), but its ${role === 'generation' ? 'result' : 'frame'} could not be read: ${detail}. fal may still make it and bill it; byway did not submit it again.`,
    false,
  );
  return Object.assign(err, { falRequests: { [role]: requestId } });
}

export function falAdapter(opts: FalAdapterOptions): ProviderAdapter {
  const fetchImpl = opts.fetch ?? fetch;
  const { queue } = opts.client;
  /**
   * A job fal accepted, polled until done and read, each round trip retried on its own (free reads). A stop ends the
   * wait (ADR-0111): before fal reported the job done it is 'running' (the caller cancels it), after that 'done'.
   */
  const pollJob = async (req: ProviderVideoRequest, role: JobRole, endpointId: string, requestId: string): Promise<Polled> => {
    const stop = req.signal;
    let done = false;
    try {
      const status = await untilStopped(req.attempt(() => queue.subscribeToStatus(endpointId, { requestId, pollInterval: POLL_INTERVAL_MS, ...(stop ? { abortSignal: stop } : {}) })), stop);
      if (status === STOPPED) return { stopped: 'running', requestId };
      done = true;
      const result = await untilStopped(req.attempt(() => queue.result(endpointId, { requestId })), stop);
      if (result === STOPPED) return { stopped: 'done', requestId };
      return { data: result.data, requestId };
    } catch (e) {
      if (stop?.aborted) return { stopped: done ? 'done' : 'running', requestId };
      throw acceptedButUnread(e, role, requestId);
    }
  };
  /**
   * One queue job: submitted once (the billable step, under the gateway's submission rule), recorded as accepted, then
   * polled and read. The id fal gave the job is the one recorded: the result's own id comes from a header and may be
   * missing. A job an earlier attempt of the call already submitted (req.resume; stage 3) is only polled.
   */
  const runJob = async (req: ProviderVideoRequest, role: JobRole, endpointId: string, input: () => Promise<Record<string, unknown>>): Promise<Polled> => {
    const resumed = req.resume?.[role];
    if (resumed !== undefined) return pollJob(req, role, endpointId, resumed);
    const body = await input();
    // Stopped before its submission: nothing more is submitted (ADR-0111), so nothing billable was sent for this job.
    if (req.signal?.aborted) throw cutOffError('fal', 'none', `${JOB_WHAT[role]} was not submitted`);
    const { request_id: requestId } = await req.submit(() => queue.submit(endpointId, { input: body }), JOB_WHAT[role]);
    await req.accepted?.(role, requestId);
    return pollJob(req, role, endpointId, requestId);
  };
  /**
   * The generation job a stop came to while it was under way (ADR-0111), by what fal said to its cancel: removed before
   * it ran, it counts nothing (Claude's reading of fal's queue page and its FAQ, which bills only inference time; the
   * first live runs' ledger is to confirm it); asked to stop while running, or a cancel that failed, it may still finish
   * and be billed, so it is counted as "may have been billed", listed with its request id; already done, the clip was
   * made and billed, so it is settled at its seconds through the made-and-billed path, without downloading it.
   */
  const stoppedGeneration = async (req: ProviderVideoRequest, polled: { stopped: 'running' | 'done'; requestId: string }): Promise<'done'> => {
    if (polled.stopped === 'done') return 'done';
    const cancel = await queue.cancel(req.model, { requestId: polled.requestId });
    if (cancel.status === 'completed') return 'done';
    if (cancel.status === 'removed') throw cutOffError('fal', 'none', `fal removed clip job ${polled.requestId} from its queue before it ran: ${cancel.detail}`);
    const said = cancel.status === 'requested' ? `fal was asked to stop clip job ${polled.requestId} while it ran (${cancel.detail}), and it can still finish it` : `byway's cancel of clip job ${polled.requestId} did not go through (${cancel.detail})`;
    throw cutOffError('fal', 'maybe', said);
  };
  return {
    id: 'fal',
    async complete() {
      throw new GatewayError('invalid-request', 'fal.ai is used for video only in byway, not for text');
    },
    videoSeconds: falVideoSeconds,
    videoExtras: [{ model: FAL_EXTRACT_FRAME, seconds: EXTRACT_FRAME_SECONDS_BOUND }],
    // A queue job is cancelled when its call's run is ending (ADR-0111).
    cutsOff: { video: true },
    async video(req: ProviderVideoRequest): Promise<ProviderVideo> {
      const spec = FAL_VIDEO_MODELS[req.model];
      if (!spec) throw new GatewayError('invalid-request', `fal model ${req.model} has no input mapping in this version`);
      const frame = req.startFrame;
      if (!frame) throw new GatewayError('invalid-request', `${req.model} makes video from a start frame, and the request has none`);

      // Failures before the generation job's result arrives are thrown, with no ledger entry: there is no clip to keep
      // and no usage to record. (A job whose status cannot be read even after retries may still finish and be billed
      // by fal; the spend book counts the call as may have been billed, with the job's request id, and the error names
      // it.) A generation job an earlier attempt submitted is polled by its id: no upload, no second submission.
      const input = { prompt: req.prompt, duration: String(req.durationSec), ...spec.extra };
      const polled = await runJob(req, 'generation', req.model, async () => {
        const frameUrl = await req.attempt(() => opts.client.storage.upload(new Blob([Buffer.from(frame.bytes)], { type: frame.mediaType })));
        return { ...input, [spec.imageField]: frameUrl };
      });
      // A stop while the clip was under way (ADR-0111): its cancel decides what is counted (stoppedGeneration).
      const stoppedDone = 'stopped' in polled ? await stoppedGeneration(req, polled) : undefined;

      const requestBody = {
        endpoint: req.model,
        input: { ...input, [spec.imageField]: `artifact:${frame.artifactId}` },
        extract: { endpoint: FAL_EXTRACT_FRAME, frame_type: 'last' },
        // A resumed call says which of its jobs an earlier attempt submitted (stage 3).
        ...(req.resume && Object.keys(req.resume).length > 0 ? { resumed: { ...req.resume } } : {}),
      };
      const response: Record<string, unknown> = { requestId: polled.requestId, ...('data' in polled ? { video: plain(polled.data) } : { stopped: 'its run was ending before byway read the clip' }) };
      // The hosts each download used, in the stored evidence: a live link shows which media hosts fal really serves from.
      const media: { clip?: string[]; frame?: string[] } = {};
      response.media = media;
      const out: ProviderVideo = { servedModel: req.model, usage: { inputTokens: 0, outputTokens: 0, units: req.durationSec }, requestBody, responseBody: response };
      // The clip was made (and billed) when the stop came: settled as made, never downloaded, and no last-frame job.
      if (stoppedDone || !('data' in polled)) {
        out.failure = cutOffError('fal', 'maybe', `fal had made clip job ${polled.requestId}`);
        return out;
      }
      const generated = polled;
      try {
        const video = fileUrl(generated.data, 'video');
        const clip = await req.attempt(() => download(fetchImpl, video.url, 'clip'));
        media.clip = clip.via;
        // Typed from its bytes, whatever a header or fal's answer claims: anything else is not kept as a clip.
        const clipType = sniffVideoType(clip.bytes);
        if (!clipType) throw new GatewayError('provider-error', 'the clip fal returned is not a video (its bytes are neither MP4 nor WebM)');
        out.clip = { bytes: clip.bytes, mediaType: clipType };
        // Stopped once the clip is kept, no last-frame job is submitted (runJob; ADR-0111): the clip is settled as made.
        const extracted = await runJob(req, 'extract', FAL_EXTRACT_FRAME, async () => ({ video_url: video.url, frame_type: 'last' }));
        if ('stopped' in extracted) {
          // Stopped while the frame job was under way: cancelled, best effort. Its cost is in the clip's settled price
          // already (the helper's bound, videoExtras), whatever fal does with it.
          const cancel = extracted.stopped === 'running' ? await queue.cancel(FAL_EXTRACT_FRAME, { requestId: extracted.requestId }) : undefined;
          response.frame = { requestId: extracted.requestId, stopped: true, ...(cancel ? { cancel: cancel.detail } : {}) };
          throw cutOffError('fal', 'maybe', `last-frame job ${extracted.requestId} was ${cancel ? `cancelled (${cancel.detail})` : 'done but not read'}`);
        }
        response.frame = { requestId: extracted.requestId, ...(plain(extracted.data) as object) };
        const last = await req.attempt(() => download(fetchImpl, fileUrl(extracted.data, 'images').url, 'last frame'));
        media.frame = last.via;
        const type = sniffImageType(last.bytes);
        if (!type) throw new GatewayError('provider-error', 'the last frame fal returned is not a PNG, JPEG or WebP image');
        out.lastFrame = { bytes: last.bytes, mediaType: type } satisfies MediaBytes;
      } catch (e) {
        // The clip is paid for: hand back what arrived so the gateway can keep it and ledger the spend.
        out.failure = e;
      }
      return out;
    },
  };
}
