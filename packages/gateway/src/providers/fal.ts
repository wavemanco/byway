import { createFalClient as createFalSdkClient } from '@fal-ai/client';
import { GatewayError } from '@byway/contracts';
import { plain, type MediaBytes, type ProviderAdapter, type ProviderVideo, type ProviderVideoRequest } from './types.ts';

/**
 * fal.ai video for C5 relay links (ADR-0069), through @fal-ai/client 1.10 (read from the package's own type
 * definitions and fal.ai's model pages, 2026-10-07):
 * - `storage.upload(blob)` puts the start frame on fal's CDN and returns its URL;
 * - `subscribe(endpointId, { input })` submits to the queue and resolves with `{ data, requestId }` when the job is done
 *   (it polls; a clip takes minutes, so `run` would hold one HTTP request open for all of it);
 * - image-to-video models answer `{ video: { url, content_type } }` (fal's `I2VOutput`);
 * - `fal-ai/ffmpeg-api/extract-frame` with `frame_type: 'last'` answers `{ images: [{ url, content_type }] }`, so
 *   fal itself provides the last frame the next link starts from, and no local video decoder is needed.
 * Media URLs expire, so the gateway downloads and stores both at once.
 */

/** The slice of the fal client the adapter uses, so tests inject a fake. */
export interface FalClientLike {
  storage: { upload(file: Blob): Promise<string> };
  subscribe(endpointId: string, options: { input: Record<string, unknown>; logs?: boolean }): Promise<{ data: unknown; requestId: string }>;
}

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

export function createFalClient(key: string): FalClientLike {
  // The gateway owns retries (one policy for every provider), so the client's own are off.
  const client = createFalSdkClient({ credentials: key, retry: { maxRetries: 0 } });
  return {
    storage: { upload: (file) => client.storage.upload(file) },
    subscribe: (endpointId, options) => client.subscribe(endpointId, options),
  };
}

/** Clips run to a few MB; anything far beyond is not a clip and is not read into memory. */
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;

const providerError = (message: string, status?: number) => Object.assign(new Error(message), status === undefined ? {} : { status });

async function download(fetchImpl: typeof fetch, url: string, what: string): Promise<{ bytes: Uint8Array; contentType: string | undefined }> {
  // Only fal's HTTPS media URLs are fetched: an answer naming another scheme is not followed.
  if (!/^https:\/\//i.test(url)) throw new GatewayError('provider-error', `fal returned a ${what} URL that is not https`);
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw providerError(`downloading the ${what} failed with HTTP ${res.status}`, res.status);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_DOWNLOAD_BYTES) throw new GatewayError('provider-error', `the ${what} is ${declared} bytes, over the ${MAX_DOWNLOAD_BYTES}-byte limit`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new GatewayError('provider-error', `the ${what} is over the ${MAX_DOWNLOAD_BYTES}-byte limit`);
  if (bytes.byteLength === 0) throw new GatewayError('provider-error', `fal returned an empty ${what}`);
  return { bytes, contentType: res.headers.get('content-type') ?? undefined };
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

export function falAdapter(opts: FalAdapterOptions): ProviderAdapter {
  const fetchImpl = opts.fetch ?? fetch;
  return {
    id: 'fal',
    async complete() {
      throw new GatewayError('invalid-request', 'fal.ai is used for video only in byway, not for text');
    },
    videoSeconds: falVideoSeconds,
    videoExtras: [{ model: FAL_EXTRACT_FRAME, seconds: EXTRACT_FRAME_SECONDS_BOUND }],
    async video(req: ProviderVideoRequest): Promise<ProviderVideo> {
      const spec = FAL_VIDEO_MODELS[req.model];
      if (!spec) throw new GatewayError('invalid-request', `fal model ${req.model} has no input mapping in this version`);
      const frame = req.startFrame;
      if (!frame) throw new GatewayError('invalid-request', `${req.model} makes video from a start frame, and the request has none`);

      // Nothing is billed until the generation succeeds, so failures up to there are thrown (and retried per step).
      const frameUrl = await req.attempt(() => opts.client.storage.upload(new Blob([Buffer.from(frame.bytes)], { type: frame.mediaType })));
      const input = { prompt: req.prompt, [spec.imageField]: frameUrl, duration: String(req.durationSec), ...spec.extra };
      const generated = await req.attempt(() => opts.client.subscribe(req.model, { input }));
      const video = fileUrl(generated.data, 'video');

      const requestBody = { endpoint: req.model, input: { ...input, [spec.imageField]: `artifact:${frame.artifactId}` }, extract: { endpoint: FAL_EXTRACT_FRAME, frame_type: 'last' } };
      const response: Record<string, unknown> = { requestId: generated.requestId, video: plain(generated.data) };
      const out: ProviderVideo = { servedModel: req.model, usage: { inputTokens: 0, outputTokens: 0, units: req.durationSec }, requestBody, responseBody: response };
      try {
        const clip = await req.attempt(() => download(fetchImpl, video.url, 'clip'));
        const clipType = [clip.contentType, video.contentType].find((t) => t?.startsWith('video/'))?.split(';')[0] ?? 'video/mp4';
        out.clip = { bytes: clip.bytes, mediaType: clipType };
        const extracted = await req.attempt(() => opts.client.subscribe(FAL_EXTRACT_FRAME, { input: { video_url: video.url, frame_type: 'last' } }));
        response.frame = { requestId: extracted.requestId, ...(plain(extracted.data) as object) };
        const last = await req.attempt(() => download(fetchImpl, fileUrl(extracted.data, 'images').url, 'last frame'));
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
