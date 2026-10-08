import { createHash } from 'node:crypto';
import type { ArtifactRecord, ArtifactStore } from '@byway/contracts';
import { encodePng } from '../src/mock/png.ts';
import type { AnthropicClientLike, AnthropicMessageLike } from '../src/providers/anthropic.ts';
import type { FalClientLike } from '../src/providers/fal.ts';
import type { GoogleClientLike, GoogleResponseLike } from '../src/providers/google.ts';
import type { ChatCompletionLike, ImagesResponseLike, OpenAIClientLike } from '../src/providers/openai.ts';

/** A content-addressed artifact store in memory, as the contract describes (ids are sha256 of the bytes). */
export class MemoryArtifacts implements ArtifactStore {
  readonly items = new Map<string, { record: ArtifactRecord; bytes: Uint8Array }>();

  async put(bytes: Uint8Array, mediaType: string): Promise<ArtifactRecord> {
    const id = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const record: ArtifactRecord = { id, mediaType, bytes: bytes.byteLength, createdAt: '2026-10-07T00:00:00.000Z' };
    this.items.set(id, { record, bytes });
    return record;
  }
  putText(text: string, mediaType: string): Promise<ArtifactRecord> {
    return this.put(new TextEncoder().encode(text), mediaType);
  }
  async get(id: string) {
    const item = this.items.get(id);
    if (!item) throw new Error(`no artifact ${id}`);
    return item;
  }
  async getText(id: string): Promise<string> {
    return new TextDecoder().decode((await this.get(id)).bytes);
  }
  async has(id: string): Promise<boolean> {
    return this.items.has(id);
  }
  /** Every stored text artifact, for leak checks. */
  allText(): string {
    return [...this.items.values()].map((i) => new TextDecoder().decode(i.bytes)).join('\n');
  }
}

type Step<T> = T | Error | (() => T | Error);
const next = <T>(queue: Step<T>[], fallback: () => T): T => {
  const item = queue.length ? queue.shift() : undefined;
  const value = typeof item === 'function' ? (item as () => T | Error)() : item;
  if (value instanceof Error) throw value;
  return value ?? fallback();
};

export const anthropicMessage = (over: Partial<AnthropicMessageLike> = {}): AnthropicMessageLike => ({
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text: '- Tighten the hero.\nScore: 6/10' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 1000, output_tokens: 500 },
  ...over,
});

/** A fake Anthropic client: replies (or throws) from a queue, then repeats a default reply. */
export function fakeAnthropic(queue: Step<AnthropicMessageLike>[] = []) {
  const calls: Record<string, unknown>[] = [];
  const client: AnthropicClientLike = {
    beta: {
      messages: {
        stream(body) {
          calls.push(body as unknown as Record<string, unknown>);
          return { finalMessage: async () => next(queue, () => anthropicMessage()) };
        },
      },
    },
  };
  return { client, calls };
}

export function fakeOpenAI(chat: Step<ChatCompletionLike>[] = [], images: Step<ImagesResponseLike>[] = []) {
  const calls: Record<string, unknown>[] = [];
  const client: OpenAIClientLike = {
    chat: {
      completions: {
        async create(body) {
          calls.push(body as unknown as Record<string, unknown>);
          return next(chat, () => ({
            model: body.model,
            choices: [{ finish_reason: 'stop', message: { content: 'Choice: A' } }],
            usage: { prompt_tokens: 1000, completion_tokens: 100 },
          }));
        },
      },
    },
    images: {
      async generate(body) {
        calls.push(body as unknown as Record<string, unknown>);
        return next(images, () => ({ data: [{ b64_json: Buffer.from('png-bytes').toString('base64') }], output_format: 'png', usage: { input_tokens: 20, output_tokens: 4000 } }));
      },
    },
  };
  return { client, calls };
}

export function fakeGoogle(queue: Step<GoogleResponseLike>[] = []) {
  const calls: Record<string, unknown>[] = [];
  const client: GoogleClientLike = {
    models: {
      async generateContent(params) {
        calls.push(params as unknown as Record<string, unknown>);
        return next(queue, () => ({
          modelVersion: params.model,
          candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { data: Buffer.from('jpeg-bytes').toString('base64'), mimeType: 'image/jpeg' } }] } }],
          usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 1290 },
        }));
      },
    },
  };
  return { client, calls };
}

const FAL_MEDIA = 'https://v3.fal.media/files';

/**
 * A fake fal.ai client: storage uploads return a URL per upload; queue jobs answer by endpoint (a video for an
 * image-to-video model, an image list for frame extraction). `failures` are thrown by submits to that endpoint, and
 * `pollFailures` by its status polls, in order. `calls` lists the submitted jobs (the billable step).
 */
export function fakeFal(failures: Record<string, Error[]> = {}, opts: { clipUrl?: string; frameUrl?: string; pollFailures?: Record<string, Error[]> } = {}) {
  const clipUrl = opts.clipUrl ?? `${FAL_MEDIA}/clip.mp4`;
  const frameUrl = opts.frameUrl ?? `${FAL_MEDIA}/last.png`;
  const calls: { endpoint: string; input: Record<string, unknown> }[] = [];
  const polls: string[] = [];
  const uploads: { type: string; bytes: number }[] = [];
  const uploadedUrl = (i: number) => `${FAL_MEDIA}/upload-${i}.png`;
  const jobs = new Map<string, string>();
  const client: FalClientLike = {
    storage: {
      async upload(file) {
        uploads.push({ type: file.type, bytes: file.size });
        return uploadedUrl(uploads.length - 1);
      },
    },
    queue: {
      async submit(endpoint, options) {
        calls.push({ endpoint, input: options.input });
        const error = failures[endpoint]?.shift();
        if (error) throw error;
        const id = `req-${jobs.size + 1}`;
        jobs.set(id, endpoint);
        return { request_id: id };
      },
      async subscribeToStatus(endpoint, options) {
        polls.push(options.requestId);
        if (jobs.get(options.requestId) !== endpoint) throw new Error(`no job ${options.requestId} on ${endpoint}`);
        const error = opts.pollFailures?.[endpoint]?.shift();
        if (error) throw error;
        return { status: 'COMPLETED', request_id: options.requestId };
      },
      async result(endpoint, options) {
        const data = endpoint.includes('extract-frame')
          ? { images: [{ url: frameUrl, content_type: 'image/png', width: 1280, height: 720 }] }
          : { video: { url: clipUrl, content_type: 'video/mp4', file_size: 9 } };
        return { data, requestId: options.requestId };
      },
    },
  };
  return { client, calls, polls, uploads, uploadedUrl, clipUrl, frameUrl };
}

/** The start of a real MP4: an ISO-BMFF `ftyp` box (size 24, brand isom), then a little of an `mdat` box. */
export const MP4_BYTES = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31, 0, 0, 0, 8, 0x6d, 0x64, 0x61, 0x74]);
/** The start of a real WebM: the EBML magic, then a header element. */
export const WEBM_BYTES = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01]);

export interface FakeFetchOptions {
  /** URL → the Location a 302 from it names; null answers a 302 with no Location at all. */
  redirects?: Record<string, string | null>;
  /** URL → a response built fresh for each request (custom bodies and headers). */
  responses?: Record<string, () => Response>;
}

/**
 * A fake fetch for provider media downloads: .mp4 URLs serve MP4 bytes, .webm WebM, .png a PNG. `statuses` overrides
 * a URL with an HTTP status (a list is answered in order, then the URL is served as usual). `inits` records what each
 * request asked for (the download must follow redirects itself: redirect 'manual').
 */
export function fakeFetch(statuses: Record<string, number | number[]> = {}, opts: FakeFetchOptions = {}) {
  const requested: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    requested.push(url);
    inits.push(init);
    const planned = statuses[url];
    const status = Array.isArray(planned) ? planned.shift() : planned;
    if (status !== undefined) return new Response('nope', { status });
    if (opts.redirects && url in opts.redirects) {
      const location = opts.redirects[url];
      return new Response(null, { status: 302, headers: location === null || location === undefined ? {} : { location } });
    }
    const custom = opts.responses?.[url];
    if (custom) return custom();
    if (url.endsWith('.mp4')) return new Response(MP4_BYTES.slice(), { headers: { 'content-type': 'video/mp4' } });
    if (url.endsWith('.webm')) return new Response(WEBM_BYTES.slice(), { headers: { 'content-type': 'video/webm' } });
    if (url.endsWith('.png')) return new Response(encodePng(4, 2, new Uint8Array(24).fill(90)), { headers: { 'content-type': 'image/png' } });
    // A JPEG served with a PNG header: the frame must be stored under what its bytes are.
    if (url.endsWith('.jpg')) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0]), { headers: { 'content-type': 'image/png' } });
    return new Response('not found', { status: 404 });
  };
  return { fetch: fetch as typeof globalThis.fetch, requested, inits };
}

/**
 * A body of `chunks` chunks of `chunkBytes` each, made only as it is read, that counts how many chunks were pulled and
 * whether the reader cancelled. Every chunk is the same buffer, so even a large body costs almost no memory.
 */
export function countingBody(chunks: number, chunkBytes = 1024 * 1024) {
  const chunk = new Uint8Array(chunkBytes).fill(7);
  const seen = { pulls: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (seen.pulls >= chunks) return controller.close();
        seen.pulls++;
        controller.enqueue(chunk);
      },
      cancel() {
        seen.cancelled = true;
      },
    },
    // Nothing is made ahead of a read, so `pulls` counts exactly what the reader asked for.
    { highWaterMark: 0 },
  );
  return { stream, seen };
}

/** An error shaped like the SDKs' API errors. */
export const httpError = (status: number, message = `HTTP ${status}`) => Object.assign(new Error(message), { status });
