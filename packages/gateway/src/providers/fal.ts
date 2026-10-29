import { createFalClient as createFalSdkClient } from '@fal-ai/client';
import { GatewayError, type ProviderJobRole } from '@byway/contracts';
import { cutOffError, isCutOff, takenOverOf } from '../errors.ts';
import { makeRedactor } from '../redact.ts';
import { isNotStarted, notStartedError, waitedError, waitMinutes } from '../waited.ts';
import { Deadline } from './deadline.ts';
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
 *   fal itself provides the last frame the next link starts from, and no local video decoder is needed. The same
 *   endpoint with `frame_type: 'middle'` gives a frame from the clip's middle for the shot check (F10 (a)): best effort,
 *   asked for after the last frame and under the same bound, so it never fails the billed clip, and counted in
 *   videoExtras whether or not it is made.
 * Media URLs expire, so the gateway downloads and stores them at once, only from fal's media host and within a byte
 * cap (download, below; ADR-0088).
 *
 * A stop (ADR-0111: the call's run is ending) submits nothing more, and cancels the job under way over fal's REST queue
 * API (cancelJob below), whose answer says what the job did: removed before it ran, asked to stop while running, or
 * already done. The SDK's own cancel resolves the same way for the first two, so it is not used.
 *
 * The clip's wait (the waits design of 2026-10-22, section 2; ProviderVideoRequest.waitMs) counts from fal's acceptance
 * of the clip job, and a resumed job keeps that time (ProviderVideoRequest.acceptedAt). When it runs out byway cancels
 * the job and reads fal's answer as for a stop, but the run goes on: removed before it ran, nothing was billed; asked to
 * stop while running, or a cancel that failed, it may have been billed, and the call says so with the job's id; already
 * done, the clip is kept and used, since it is paid for. fal is asked once for the job's status before a resumed job
 * whose wait has already run out is cancelled, and once more after a cancel that failed, so a clip it finished is kept
 * either way (pollJob, waitedGeneration); each read is waited for as long as a cancel is (seenDone). The job is never
 * submitted again. The clip job is submitted with a start deadline below the wait (falStartTimeoutSeconds), and the
 * last frame's extraction is bounded by the time left on the clip's wait plus FRAME_GRACE_MS. A clip job fal dropped at that deadline, before it started, answers its
 * result with 504 and `X-Fal-Request-Timeout-Type: user`: nothing was billed (fal's queue and pricing pages, quoted in
 * waited.ts notStartedWords), so the call counts nothing and the step says so plainly.
 */

/** The slice of the fal client the adapter uses, so tests inject a fake. */
export interface FalClientLike {
  storage: { upload(file: Blob): Promise<string> };
  queue: {
    /** `startTimeoutSeconds`: the job's start deadline (falStartTimeoutSeconds), sent as fal's two headers (submitJob). */
    submit(endpointId: string, options: { input: Record<string, unknown>; startTimeoutSeconds?: number }): Promise<{ request_id: string }>;
    subscribeToStatus(endpointId: string, options: { requestId: string; pollInterval?: number; abortSignal?: AbortSignal }): Promise<unknown>;
    /**
     * One read of a job's status, a free read: fal answers IN_QUEUE, IN_PROGRESS or COMPLETED (the SDK's QueueStatus).
     * The adapter asks it once where polling would not get an answer in time (seenDone).
     */
    status(endpointId: string, options: { requestId: string }): Promise<{ status: string }>;
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

/** The helper jobs every fal clip is priced with (ProviderAdapter.videoExtras): its last frame, and its middle frame (F10 (a)). */
export const FAL_VIDEO_EXTRAS: readonly { model: string; seconds: number }[] = [
  { model: FAL_EXTRACT_FRAME, seconds: EXTRACT_FRAME_SECONDS_BOUND },
  { model: FAL_EXTRACT_FRAME, seconds: EXTRACT_FRAME_SECONDS_BOUND },
];

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

/**
 * The last frame's extraction may take the time left on its clip's wait and this much more (the waits design of
 * 2026-10-22, section 2: under its clip's wait by the research, and the two minutes save a late clip's frame).
 */
export const FRAME_GRACE_MS = 2 * 60_000;

/**
 * fal's start deadline for a clip job, in seconds: fal drops a job that has not started by then, unbilled (the waits
 * design, section 2). It is the clip's wait less about one clip's making, so a job that starts late still has room to
 * finish within the wait and byway rarely pays for a clip it throws away: 5 minutes for a clip up to 5 seconds (Kling 3
 * Pro's p95), 10 up to 10 seconds, and 15 above that (the research report's figure for 15 seconds, scaled, which it says
 * overstates). Undefined when that leaves no time fal would take (its client refuses one second or less).
 */
export function falStartTimeoutSeconds(waitMs: number, clipSeconds: number): number | undefined {
  const making = clipSeconds <= 5 ? 5 : clipSeconds <= 10 ? 10 : 15;
  const seconds = Math.floor((waitMs - making * 60_000) / 1000);
  return seconds > 1 ? seconds : undefined;
}

/**
 * fal's two names for a job's start deadline, both sent: `X-Fal-Request-Start-Timeout` (fal's queue documentation) and
 * `x-fal-request-timeout` (what @fal-ai/client 1.10.1 sends for its `startTimeout`). Which one fal's server honours is
 * not tested; the first live clip run is to show it accepts them.
 */
export const FAL_START_TIMEOUT_HEADERS = ['X-Fal-Request-Start-Timeout', 'x-fal-request-timeout'] as const;

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
 * the job and only the answer was lost. `startTimeoutSeconds`, when given, is the job's start deadline, under both of
 * fal's names for it (FAL_START_TIMEOUT_HEADERS).
 */
export async function submitJob(fetchImpl: typeof fetch, key: string, endpointId: string, input: Record<string, unknown>, startTimeoutSeconds?: number): Promise<{ request_id: string }> {
  if (!ENDPOINT_ID.test(endpointId)) throw new GatewayError('invalid-request', `"${endpointId}" is not a fal endpoint id`);
  const start = startTimeoutSeconds === undefined ? {} : Object.fromEntries(FAL_START_TIMEOUT_HEADERS.map((h) => [h, String(startTimeoutSeconds)]));
  const res = await fetchImpl(`${FAL_QUEUE_URL}/${endpointId}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json', Accept: 'application/json', ...start },
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

/** A cancel is answered at once; this bounds a lost answer. One read of a job's status is bounded the same (seenDone). */
const CANCEL_TIMEOUT_MS = 30_000;
/**
 * How long a clip a stop came to after fal reported it done has its result read for, once, before it is settled as
 * made (falAdapter's stoppedGeneration): a result is answered at once, so, as for a cancel, this bounds a lost answer.
 */
export const RESULT_LOOK_MS = 30_000;
/**
 * How much of fal's own status text a cancel's detail keeps. fal's documented answers are single words (at most 22
 * characters, CANCELLATION_REQUESTED); anything longer is not one of them, and the detail reaches stored and shown errors.
 */
const STATUS_CHARS = 64;
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
 * it was, which the caller counts as "may have been billed". What came back is redacted (fal could echo the key it was
 * sent) before it is cut short (STATUS_CHARS) into the detail: cut first, part of a key across the cut would escape.
 */
export async function cancelJob(fetchImpl: typeof fetch, key: string, endpointId: string, requestId: string): Promise<FalCancel> {
  if (!ENDPOINT_ID.test(endpointId)) return { status: 'failed', detail: `"${endpointId}" is not a fal endpoint id` };
  const redact = makeRedactor({ FAL_KEY: key });
  let res: Response;
  try {
    res = await fetchImpl(`${FAL_QUEUE_URL}/${falAppId(endpointId)}/requests/${encodeURIComponent(requestId)}/cancel`, {
      method: 'PUT',
      headers: { Authorization: `Key ${key}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS),
    });
  } catch (e) {
    return { status: 'failed', detail: redact(`no answer: ${(e as Error)?.message ?? String(e)}`).slice(0, 300) };
  }
  const text = await res.text().catch(() => '');
  let status: unknown;
  try {
    status = (JSON.parse(text) as { status?: unknown } | null)?.status;
  } catch {
    status = undefined;
  }
  const said = `HTTP ${res.status}${typeof status === 'string' ? ` ${redact(status).slice(0, STATUS_CHARS)}` : ''}`;
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
  const storage = createFalSdkClient({ credentials: key, retry: { maxRetries: 0 }, fetch: uploadFetch(fetchImpl) });
  return {
    storage: { upload: (file) => storage.storage.upload(file) },
    queue: {
      submit: (endpointId, options) => submitJob(fetchImpl, key, endpointId, options.input, options.startTimeoutSeconds),
      subscribeToStatus: (endpointId, options) => client.queue.subscribeToStatus(endpointId, options),
      status: (endpointId, options) => client.queue.status(endpointId, options),
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

/** fal's REST API, where the SDK asks for an upload's slot (storage.js initiateUpload, getRestApiUrl). */
const FAL_REST_ORIGIN = 'https://rest.fal.ai';

/**
 * The fetch the SDK's start-frame upload goes through (F17 (a)). The SDK asks fal's REST API for a slot, then PUTs the
 * frame to the `upload_url` fal's answer names, with fetch's default redirects (@fal-ai/client 1.10.1, storage.js).
 * That URL is fal's to name, as a media URL is, so it is held to admitMediaUrl (ADR-0088), and its redirects are not
 * followed at all: a PUT followed hop by hop would send the frame again to each hop. A slot outside fal's media host is
 * refused before anything is sent, and nothing is billed, since the upload comes before the clip's submission.
 */
function uploadFetch(fetchImpl: typeof fetch): typeof fetch {
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === FAL_REST_ORIGIN) return fetchImpl(input, init);
    if (!admitMediaUrl(url)) return Promise.reject(mediaError(`fal named an upload address for the start frame outside its media host (${originOf(url)})`));
    return fetchImpl(input, { ...init, redirect: 'error' });
  };
}

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

/**
 * One media download under the rules above. `via` lists the origin of every URL fetched, for the evidence. `bound`, when
 * given, also ends it (the last frame's bound).
 */
async function download(fetchImpl: typeof fetch, url: string, what: string, bound?: AbortSignal): Promise<{ bytes: Uint8Array; via: string[] }> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw mediaError(`fal returned a ${what} URL that cannot be read`);
  }
  if (!admitMediaUrl(current)) throw mediaError(`fal returned a ${what} URL outside its media host (${originOf(current)})`);
  const signal = bound ? AbortSignal.any([AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), bound]) : AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
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

/**
 * The last frame's extraction outlasted its bound (the time left on its clip's wait plus FRAME_GRACE_MS). The clip is
 * made and billed, and kept; the step says the frame could not be extracted, with this.
 */
function frameTooLate(what: string, cancel?: string): GatewayError {
  return new GatewayError('provider-error', `${what} did not finish within the time left on the clip’s wait plus ${FRAME_GRACE_MS / 60_000} minutes, so byway stopped waiting${cancel !== undefined ? ` and cancelled it (${cancel})` : ''}`);
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

/** The jobs a relay link submits, by role: the clip, its last frame, then its middle frame. */
type JobRole = ProviderJobRole;
const JOB_WHAT: Record<JobRole, string> = { generation: 'the clip', extract: 'the last-frame job', middle: 'the middle-frame job' };

/** A wait that a stop ended first (untilEnded). */
export const STOPPED = Symbol('stopped');
/** A wait that its own deadline ended first: the clip's wait, or the frame's bound (untilEnded). */
export const WAITED = Symbol('waited');

/**
 * `work`, or STOPPED once `stop` aborts, or WAITED once `deadline` does (at once when one already has; the stop first).
 * What `work` does afterwards is ignored. Exported for its test.
 */
export async function untilEnded<T>(work: Promise<T>, stop: AbortSignal | undefined, deadline?: AbortSignal): Promise<T | typeof STOPPED | typeof WAITED> {
  if (!stop && !deadline) return work;
  work.catch(() => undefined);
  if (stop?.aborted) return STOPPED;
  if (deadline?.aborted) return WAITED;
  const listening: { signal: AbortSignal; on: () => void }[] = [];
  const ended = new Promise<typeof STOPPED | typeof WAITED>((resolve) => {
    for (const [signal, mark] of [
      [stop, STOPPED],
      [deadline, WAITED],
    ] as const) {
      if (!signal) continue;
      const on = () => resolve(mark);
      signal.addEventListener('abort', on, { once: true });
      listening.push({ signal, on });
    }
  });
  try {
    return await Promise.race([work, ended]);
  } finally {
    for (const { signal, on } of listening) signal.removeEventListener('abort', on);
  }
}

/** The signals that end a wait, as one (the SDK's polling is told to stop when either aborts). */
const either = (stop: AbortSignal | undefined, deadline: AbortSignal | undefined): AbortSignal | undefined => (stop && deadline ? AbortSignal.any([stop, deadline]) : (stop ?? deadline));

/** A job polled until done and read; or, when a stop or its deadline came first, whether fal had already finished it. */
type Polled = ({ data: unknown } | { stopped: 'running' | 'done' } | { waited: 'running' | 'done' }) & { requestId: string };

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

/**
 * fal dropped the job at the start deadline it was sent with: its result answered 504 with `X-Fal-Request-Timeout-Type:
 * user` (fal's queue page), which @fal-ai/client 1.10.1 hands on as an ApiError carrying `status` and `timeoutType`, as
 * its own isUserTimeout reads them (and, by that reading, never retries). Read by those fields, as errors.ts reads the
 * SDKs' errors, rather than by the SDK's class.
 */
const droppedAtStart = (e: unknown): boolean => {
  const err = e as { status?: unknown; timeoutType?: unknown } | null;
  return err?.status === 504 && err.timeoutType === 'user';
};

/**
 * The statuses with which fal answers a job's result to say that the job itself failed: 400 (`bad_request`), 422 (its
 * model errors, `content_policy_violation`, `no_media_generated` and the input checks) and 500 (`internal_server_error`,
 * `downstream_service_error`), from fal's errors page (fal.ai/docs/model-apis/errors, read 2026-10-28). The others are
 * about the read, not the job: 401 and 403 (the key), 408, 429 (fal's limits, which @fal-ai/client 1.10.1 retries), 499,
 * 502 and 503 (fal's runners and gateway, retried too), and a 504 without the start-deadline header, whose types on that
 * page are a timeout of the request as often as of the generation (R2-MONEY-1, Block 2's second re-check; Claude's
 * choice, which the row left to Claude).
 */
const JOB_FAILED_STATUSES = new Set([400, 422, 500]);

/**
 * fal's own word that a job failed, in words (its HTTP status), or undefined when the failure is not that word: one of
 * JOB_FAILED_STATUSES with fal's JSON error body (an object with its `detail`), which @fal-ai/client 1.10.1 hands on as
 * an ApiError (a ValidationError for 422) carrying `status` and `body`. A page from a proxy in between has no such body,
 * and a lost connection or a timeout has no status, so neither is fal's word on the job. The body is how errors.ts tells
 * fal's own 5xx from a proxy's (hasProviderBody); here it is asked of a 4xx too, since a status without fal's body says
 * nothing of the job either (Claude's reading). Read by those fields, as droppedAtStart reads them, and before the
 * gateway maps the error, which keeps neither.
 */
const falFailure = (e: unknown): string | undefined => {
  const err = e as { status?: unknown; body?: unknown } | null;
  const body = err?.body;
  const fals = typeof body === 'object' && body !== null && 'detail' in body;
  return typeof err?.status === 'number' && JOB_FAILED_STATUSES.has(err.status) && fals ? `HTTP ${err.status}` : undefined;
};

/**
 * What a job is waited for under (runJob): `signal` ends the wait; with `reading`, the job's result is read under it too
 * (the frame's bound); `passed`, the wait had already run out as the poll began (a clip job resumed after its wait).
 */
interface JobDeadline {
  signal: AbortSignal;
  reading?: boolean;
  passed?: boolean;
}

export function falAdapter(opts: FalAdapterOptions): ProviderAdapter {
  const fetchImpl = opts.fetch ?? fetch;
  const { queue } = opts.client;
  /**
   * Whether fal says a job is done, by one read of its status (a free read, retried as any round trip is), waited for at
   * most CANCEL_TIMEOUT_MS, as a cancel's answer is: a status is answered at once, so this bounds a lost answer. True
   * when fal answers that the job is done; false when it says the job is queued or running, when the status cannot be
   * read at all, and when no answer comes in time, since then nothing shows it done; STOPPED when the call's stop comes
   * first (ADR-0111), which ends the read at once. Before the bound a hung read was waited for as long as its retries and
   * Node's fetch limits allowed, some minutes, and the read after a failed cancel was not ended by a stop either
   * (R-MONEY-2, Block 2's re-check).
   */
  const seenDone = async (req: ProviderVideoRequest, endpointId: string, requestId: string): Promise<boolean | typeof STOPPED> => {
    const bound = new Deadline(CANCEL_TIMEOUT_MS);
    try {
      const seen = await untilEnded(req.attempt(() => queue.status(endpointId, { requestId })), req.signal, bound.signal);
      if (seen === STOPPED) return STOPPED;
      return seen !== WAITED && seen.status === 'COMPLETED';
    } catch {
      return false;
    } finally {
      bound.end();
    }
  };
  /**
   * A job's result, one read. A clip job fal dropped unstarted at its start deadline answers it with that word (its 504,
   * droppedAtStart): nothing was billed, and the call ends plainly (waited.ts notStartedWords), with the wait it was given
   * and the deadline it was sent with.
   */
  const readResult = (req: ProviderVideoRequest, role: JobRole, endpointId: string, requestId: string) =>
    queue.result(endpointId, { requestId }).catch((e: unknown) => {
      if (role !== 'generation' || !droppedAtStart(e)) throw e;
      const start = req.waitMs === undefined ? undefined : falStartTimeoutSeconds(req.waitMs, req.durationSec);
      throw notStartedError({ provider: 'fal', model: req.model }, requestId, { ...(req.waitMs !== undefined ? { minutes: waitMinutes(req.waitMs) } : {}), ...(start !== undefined ? { startMinutes: start / 60 } : {}) });
    });
  /**
   * A job fal accepted, polled until done and read, each round trip retried on its own (free reads). A stop ends the
   * wait (ADR-0111): before fal reported the job done it is 'running' (the caller cancels it), after that 'done'. So
   * does `deadline` (its wait ran out; the stop is looked at first), and with `deadline.reading` the job's result is
   * read under it too (the frame's bound); otherwise a job fal finished in time is read whatever the time.
   *
   * A wait that had already run out as the poll began (`deadline.passed`: a clip job an earlier attempt left, resumed
   * after its wait) is not raced against the status at all: its deadline is a timer of no time, which would end the wait
   * before any answer could come back, and the job would be cancelled unseen. fal is asked once instead (seenDone): a job
   * it reports done is read, whatever the time, as one that finished within its wait is; one it reports queued or
   * running, or whose status cannot be read or does not answer within CANCEL_TIMEOUT_MS, ends the wait there, and the
   * caller cancels it (MONEY-2, Block 2's check: a clip fal had finished and billed was thrown away when that one cancel
   * failed, in words saying it did not finish). A stop during that read is a stop.
   */
  const pollJob = async (req: ProviderVideoRequest, role: JobRole, endpointId: string, requestId: string, deadline?: JobDeadline): Promise<Polled> => {
    const stop = req.signal;
    const until = deadline?.signal;
    const ended = (mark: typeof STOPPED | typeof WAITED, state: 'running' | 'done'): Polled => (mark === STOPPED ? { stopped: state, requestId } : { waited: state, requestId });
    const read = () => readResult(req, role, endpointId, requestId);
    let done = false;
    try {
      if (deadline?.passed) {
        const seen = await seenDone(req, endpointId, requestId);
        if (seen !== true) return ended(seen === STOPPED ? STOPPED : WAITED, 'running');
      } else {
        const watching = either(stop, until);
        const status = await untilEnded(req.attempt(() => queue.subscribeToStatus(endpointId, { requestId, pollInterval: POLL_INTERVAL_MS, ...(watching ? { abortSignal: watching } : {}) })), stop, until);
        if (status === STOPPED || status === WAITED) return ended(status, 'running');
      }
      done = true;
      const result = await untilEnded(req.attempt(read), stop, deadline?.reading ? until : undefined);
      if (result === STOPPED || result === WAITED) return ended(result, 'done');
      return { data: result.data, requestId };
    } catch (e) {
      // fal's own word that the job never ran comes first: it was not billed, whatever else ended the wait.
      if (isNotStarted(e)) throw e;
      if (stop?.aborted) return { stopped: done ? 'done' : 'running', requestId };
      if (until?.aborted && (!done || deadline?.reading)) return { waited: done ? 'done' : 'running', requestId };
      throw acceptedButUnread(e, role, requestId);
    }
  };
  /**
   * One queue job: submitted once (the billable step, under the gateway's submission rule; with `startTimeoutSeconds`
   * as its start deadline), recorded as accepted, then polled and read. The id fal gave the job is the one recorded:
   * the result's own id comes from a header and may be missing. A job an earlier attempt of the call already submitted
   * (req.resume; stage 3) is only polled. `deadline` is what the job is waited for under, given when fal accepted it (for
   * a resumed job, when the spend book says it was: req.acceptedAt; else now).
   */
  const runJob = async (
    req: ProviderVideoRequest,
    role: JobRole,
    endpointId: string,
    input: () => Promise<Record<string, unknown>>,
    opts: { startTimeoutSeconds?: number; deadline?: (acceptedAt: number) => JobDeadline | undefined } = {},
  ): Promise<Polled> => {
    const resumed = req.resume?.[role];
    if (resumed !== undefined) return pollJob(req, role, endpointId, resumed, opts.deadline?.(req.acceptedAt?.[role] ?? Date.now()));
    const body = await input();
    // Stopped before its submission: nothing more is submitted (ADR-0111), so nothing billable was sent for this job.
    if (req.signal?.aborted) throw cutOffError('fal', 'none', `${JOB_WHAT[role]} was not submitted`);
    const start = opts.startTimeoutSeconds;
    let requestId: string;
    try {
      ({ request_id: requestId } = await req.submit(() => queue.submit(endpointId, { input: body, ...(start !== undefined ? { startTimeoutSeconds: start } : {}) }), JOB_WHAT[role]));
    } catch (e) {
      // Another attempt's jobs fal had already accepted, which this call now holds (B-071): this and any later job of
      // the call are polled by those ids, as a resumed call's are, and not submitted. The request is updated in place so
      // the last-frame job and the stored request body see them too.
      const taken = takenOverOf(e);
      if (taken?.resume[role] === undefined) throw e;
      req.resume = taken.resume;
      if (taken.acceptedAt) req.acceptedAt = taken.acceptedAt;
      else delete req.acceptedAt;
      return runJob(req, role, endpointId, input, opts);
    }
    const acceptedAt = Date.now();
    await req.accepted?.(role, requestId);
    return pollJob(req, role, endpointId, requestId, opts.deadline?.(acceptedAt));
  };
  /**
   * The generation job a stop came to while it was under way (ADR-0111), by what fal said to its cancel: removed before
   * it ran, it counts nothing (Claude's reading of fal's queue page and its FAQ, which bills only inference time; the
   * first live runs' ledger is to confirm it); asked to stop while running, or a cancel that failed, it may still finish
   * and be billed, so it is counted as "may have been billed", listed with its request id; already done, the clip was
   * made and billed, so it is settled at its seconds through the made-and-billed path, without downloading it.
   *
   * "Done" here is fal's status (or its cancel's "already completed"), and a job fal dropped unstarted at its start
   * deadline is done too: only its result says it never ran (droppedAtStart). So is a job that failed: fal reports it
   * done, and only its result says it failed. So before a done job is settled as made, its result is read once (a free
   * read; no new job, which is all a stop forbids), for at most RESULT_LOOK_MS, and fal's word on the job is taken over
   * the stop's. Its word that the job never ran comes first, and nothing is counted for it (notStartedError). fal's word
   * that the job failed (falFailure: a 400, a 422 or a 500 with fal's own body) says the clip may not have been made,
   * and fal may have billed the work: the call is counted as "may have been billed", at its estimate, listed with the
   * job's id, and nothing is ledgered, as the same answer is counted without a stop (acceptedButUnread). A result that
   * comes back, an answer about the read rather than the job (fal's limits, its gateway, the key: a 429, a 503, a 401),
   * a failure that is not fal's word (a lost connection, a proxy's page) or no answer in time leaves it settled as made,
   * as before (R2-MONEY-1, Block 2's second re-check). (TESTS-1, Block 2's check: a stop during the dropped
   * job's result read, or during its poll with fal answering the cancel "already completed", ledgered a clip fal had not
   * made or billed. R-MONEY-1, its re-check: the same two races ledgered a clip whose result fal answered with its own
   * failure, which the look had read and dropped.)
   */
  const stoppedGeneration = async (req: ProviderVideoRequest, polled: { stopped: 'running' | 'done'; requestId: string }): Promise<'done'> => {
    if (polled.stopped === 'running') {
      const cancel = await queue.cancel(req.model, { requestId: polled.requestId });
      if (cancel.status === 'removed') throw cutOffError('fal', 'none', `fal removed clip job ${polled.requestId} from its queue before it ran: ${cancel.detail}`);
      if (cancel.status !== 'completed') {
        const said = cancel.status === 'requested' ? `fal was asked to stop clip job ${polled.requestId} while it ran (${cancel.detail}), and it can still finish it` : `byway's cancel of clip job ${polled.requestId} did not go through (${cancel.detail})`;
        throw cutOffError('fal', 'maybe', said);
      }
    }
    // fal's own failure answer is read from the SDK's error here, before the gateway maps it (which keeps no status or
    // body), and thrown as the call's outcome: not retryable, so it is not read again. readResult has already turned fal's
    // start-deadline answer into notStartedError, which carries neither, so that word still comes first.
    const read = () =>
      readResult(req, 'generation', req.model, polled.requestId).catch((e: unknown) => {
        const said = falFailure(e);
        throw said === undefined ? e : cutOffError('fal', 'maybe', `fal reported clip job ${polled.requestId} done, but answered its result with a failure, ${said}`);
      });
    const look = new Deadline(RESULT_LOOK_MS);
    try {
      await untilEnded(req.attempt(read), undefined, look.signal);
    } catch (e) {
      if (isNotStarted(e) || isCutOff(e)) throw e;
    } finally {
      look.end();
    }
    return 'done';
  };
  /**
   * The generation job whose wait ran out before fal finished it (the waits design, section 2): cancelled, and counted by
   * what fal said, as for a stop, but in the words of a wait that ran out (waited.ts) and never sent again. Removed
   * before it ran, nothing was billed; asked to stop while running, or a cancel that failed, it may have been billed,
   * with the job's id; already done, the clip is kept and used ('done'), since it is paid for. A cancel that failed
   * (no answer, or one fal's page does not list) left the job as it was, which may be done by now: fal is asked once
   * more (seenDone), and a clip it finished is kept and used as well, rather than thrown away as may have been billed.
   * That look is bounded as the cancel is (CANCEL_TIMEOUT_MS) and ended by a stop; one that runs out, or that a stop
   * ends, shows nothing done, so the job is counted as the failed cancel left it, may have been billed.
   */
  const waitedGeneration = async (req: ProviderVideoRequest, polled: { waited: 'running' | 'done'; requestId: string }, waitMs: number): Promise<'done'> => {
    if (polled.waited === 'done') return 'done';
    const cancel = await queue.cancel(req.model, { requestId: polled.requestId });
    if (cancel.status === 'completed') return 'done';
    if (cancel.status === 'failed' && (await seenDone(req, req.model, polled.requestId)) === true) return 'done';
    const said =
      cancel.status === 'removed'
        ? `fal removed it from its queue before it ran (${cancel.detail}), so nothing was billed`
        : cancel.status === 'requested'
          ? `fal was asked to stop it while it ran (${cancel.detail}), and it can still finish it`
          : `byway’s cancel did not go through (${cancel.detail})`;
    const billing = cancel.status === 'removed' ? 'none' : 'maybe';
    throw waitedError({ provider: 'fal', model: req.model }, { minutes: waitMinutes(waitMs), how: 'clip', cancel: said }, { retryable: false, billing, job: polled.requestId });
  };
  /**
   * A frame from the middle of the clip (F10 (a)), or why there is none. Best effort: it never throws, so it never fails
   * the billed clip. Its job is cancelled, best effort, when a stop or the frame's bound ends it first; its cost is in the
   * clip's settled price already (FAL_VIDEO_EXTRAS), whatever fal does with it.
   */
  const middleFrame = async (req: ProviderVideoRequest, videoUrl: string, bound: Deadline | undefined): Promise<{ frame: MediaBytes; via: string[]; requestId: string } | { problem: string; requestId?: string }> => {
    let requestId: string | undefined;
    try {
      const job = await runJob(req, 'middle', FAL_EXTRACT_FRAME, async () => ({ video_url: videoUrl, frame_type: 'middle' }), bound ? { deadline: () => ({ signal: bound.signal, reading: true }) } : {});
      requestId = job.requestId;
      if (!('data' in job)) {
        const state = 'stopped' in job ? job.stopped : job.waited;
        const cancel = state === 'running' ? await queue.cancel(FAL_EXTRACT_FRAME, { requestId: job.requestId }) : undefined;
        return { problem: `${'stopped' in job ? 'its run was ending' : 'the frame’s time ran out'}${cancel ? ` (cancelled: ${cancel.detail})` : ''}`, requestId };
      }
      const url = fileUrl(job.data, 'images').url;
      const got = await untilEnded(req.attempt(() => download(fetchImpl, url, 'middle frame', bound?.signal)), undefined, bound?.signal);
      if (got === WAITED || got === STOPPED) return { problem: 'its download did not finish in time', requestId };
      const mediaType = sniffImageType(got.bytes);
      if (!mediaType) return { problem: 'it is not a PNG, JPEG or WebP image', requestId };
      return { frame: { bytes: got.bytes, mediaType }, via: got.via, requestId };
    } catch (e) {
      return { problem: e instanceof Error ? e.message : String(e), ...(requestId ? { requestId } : {}) };
    }
  };
  return {
    id: 'fal',
    async complete() {
      throw new GatewayError('invalid-request', 'fal.ai is used for video only in byway, not for text');
    },
    videoSeconds: falVideoSeconds,
    videoExtras: FAL_VIDEO_EXTRAS,
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
      // The clip's wait counts from fal's acceptance (req.waitMs; a resumed job's from when it was accepted), and its
      // job is submitted with a start deadline below that wait.
      const waitMs = req.waitMs;
      let clipWait: Deadline | undefined;
      let clipEndsAt: number | undefined;
      const startTimeoutSeconds = waitMs === undefined ? undefined : falStartTimeoutSeconds(waitMs, req.durationSec);
      let polled: Polled;
      try {
        polled = await runJob(
          req,
          'generation',
          req.model,
          async () => {
            const frameUrl = await req.attempt(() => opts.client.storage.upload(new Blob([Buffer.from(frame.bytes)], { type: frame.mediaType })));
            return { ...input, [spec.imageField]: frameUrl };
          },
          {
            ...(startTimeoutSeconds !== undefined ? { startTimeoutSeconds } : {}),
            ...(waitMs !== undefined
              ? {
                  deadline: (acceptedAt: number) => {
                    clipEndsAt = acceptedAt + waitMs;
                    const left = clipEndsAt - Date.now();
                    clipWait = new Deadline(Math.max(0, left));
                    // A resumed job whose wait has already run out is asked about once, not polled (pollJob).
                    return { signal: clipWait.signal, ...(left <= 0 ? { passed: true } : {}) };
                  },
                }
              : {}),
          },
        );
      } finally {
        clipWait?.end();
      }
      // A stop while the clip was under way (ADR-0111): its cancel decides what is counted (stoppedGeneration). Its wait
      // running out first decides the same way, and a clip fal had finished by then is read and kept.
      if ('waited' in polled && waitMs !== undefined && (await waitedGeneration(req, polled, waitMs)) === 'done') polled = await pollJob(req, 'generation', req.model, polled.requestId);
      const stoppedDone = 'stopped' in polled ? await stoppedGeneration(req, polled) : undefined;

      const requestBody = {
        endpoint: req.model,
        input: { ...input, [spec.imageField]: `artifact:${frame.artifactId}` },
        extract: { endpoint: FAL_EXTRACT_FRAME, frame_type: 'last' },
        middle: { endpoint: FAL_EXTRACT_FRAME, frame_type: 'middle' },
        // A resumed call says which of its jobs an earlier attempt submitted (stage 3).
        ...(req.resume && Object.keys(req.resume).length > 0 ? { resumed: { ...req.resume } } : {}),
      };
      const response: Record<string, unknown> = { requestId: polled.requestId, ...('data' in polled ? { video: plain(polled.data) } : { stopped: 'its run was ending before byway read the clip' }), ...(startTimeoutSeconds !== undefined ? { startTimeoutSeconds } : {}) };
      // The hosts each download used, in the stored evidence: a live link shows which media hosts fal really serves from.
      const media: { clip?: string[]; frame?: string[]; middle?: string[] } = {};
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
        // The last frame is made and fetched under the time left on the clip's wait plus FRAME_GRACE_MS, from here: its
        // job, its result and its download. Without a wait, as long as the step runs.
        const frameBound = clipEndsAt === undefined ? undefined : new Deadline(Math.max(0, clipEndsAt - Date.now()) + FRAME_GRACE_MS);
        try {
          // Stopped once the clip is kept, no last-frame job is submitted (runJob; ADR-0111): the clip is settled as made.
          const extracted = await runJob(req, 'extract', FAL_EXTRACT_FRAME, async () => ({ video_url: video.url, frame_type: 'last' }), frameBound ? { deadline: () => ({ signal: frameBound.signal, reading: true }) } : {});
          if ('stopped' in extracted) {
            // Stopped while the frame job was under way: cancelled, best effort. Its cost is in the clip's settled price
            // already (the helper's bound, videoExtras), whatever fal does with it.
            const cancel = extracted.stopped === 'running' ? await queue.cancel(FAL_EXTRACT_FRAME, { requestId: extracted.requestId }) : undefined;
            response.frame = { requestId: extracted.requestId, stopped: true, ...(cancel ? { cancel: cancel.detail } : {}) };
            throw cutOffError('fal', 'maybe', `last-frame job ${extracted.requestId} was ${cancel ? `cancelled (${cancel.detail})` : 'done but not read'}`);
          }
          if ('waited' in extracted) {
            // Its bound ran out first: cancelled, best effort, its cost in the clip's settled price as above.
            const cancel = extracted.waited === 'running' ? await queue.cancel(FAL_EXTRACT_FRAME, { requestId: extracted.requestId }) : undefined;
            response.frame = { requestId: extracted.requestId, waited: true, ...(cancel ? { cancel: cancel.detail } : {}) };
            throw frameTooLate(`last-frame job ${extracted.requestId}`, cancel?.detail);
          }
          response.frame = { requestId: extracted.requestId, ...(plain(extracted.data) as object) };
          const url = fileUrl(extracted.data, 'images').url;
          const last = await untilEnded(req.attempt(() => download(fetchImpl, url, 'last frame', frameBound?.signal)), undefined, frameBound?.signal);
          if (last === WAITED || last === STOPPED) throw frameTooLate('the last frame’s download');
          media.frame = last.via;
          const type = sniffImageType(last.bytes);
          if (!type) throw new GatewayError('provider-error', 'the last frame fal returned is not a PNG, JPEG or WebP image');
          out.lastFrame = { bytes: last.bytes, mediaType: type } satisfies MediaBytes;
          const middle = await middleFrame(req, video.url, frameBound);
          if ('frame' in middle) {
            out.middleFrame = middle.frame;
            media.middle = middle.via;
            response.middleFrame = { requestId: middle.requestId };
          } else response.middleFrame = { ...(middle.requestId ? { requestId: middle.requestId } : {}), notMade: middle.problem };
        } finally {
          frameBound?.end();
        }
      } catch (e) {
        // The clip is paid for: hand back what arrived so the gateway can keep it and ledger the spend.
        out.failure = e;
      }
      return out;
    },
  };
}
