import OpenAI from 'openai';
import type { MediaType } from '@byway/contracts';
import type { TokenBreakdown } from '../prices.ts';
import { providerFetch } from './fetch.ts';
import { streamEndedEarly, StreamIdle, streamStalled } from './stream.ts';
import {
  imageData,
  plain,
  textOf,
  type ProviderAdapter,
  type ProviderCompletion,
  type ProviderCompletionRequest,
  type ProviderImage,
  type ProviderImageRequest,
} from './types.ts';

type ChatParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
type ChatStreamParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ImageParams = OpenAI.Images.ImageGenerateParamsNonStreaming;

/** OpenRouter's routing extension to the Chat Completions body (openrouter.ai/docs/guides/routing/provider-selection). */
export interface OpenRouterRouting {
  provider?: { only: string[]; allow_fallbacks: boolean };
}

/** The fields of a chat completion the adapter reads. OpenRouter adds `provider` and `usage.cost`. */
export interface ChatCompletionLike {
  model: string;
  provider?: string;
  choices: ReadonlyArray<{ finish_reason?: string | null; message: { content?: string | null; refusal?: string | null } }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number | null; cache_write_tokens?: number | null } | null;
    cost?: number | null;
  } | null;
}

/**
 * The fields of a streamed chat completion chunk the adapters read (a structural subset of the SDK's
 * ChatCompletionChunk; OpenRouter adds `provider`, and `usage.cost` in its last chunk).
 */
export interface ChatChunkLike {
  id?: string;
  model?: string;
  provider?: string;
  choices?: ReadonlyArray<{ index?: number; finish_reason?: string | null; delta?: { content?: string | null; refusal?: string | null } | null }> | null;
  usage?: ChatCompletionLike['usage'];
}

export interface ImagesResponseLike {
  data?: ReadonlyArray<{ b64_json?: string | null }> | null;
  output_format?: string | null;
  usage?: { input_tokens: number; output_tokens: number } | null;
}

/**
 * The slice of the OpenAI SDK client the adapters use (OpenRouter is reached through the same SDK). Chat calls are
 * streamed (ADR-0111), so a stop can close them: `signal` aborts the request, and the SDK then ends the stream. It is
 * always given: it also closes a stream that has stalled (StreamIdle).
 */
export interface OpenAIClientLike {
  chat: { completions: { create(body: ChatStreamParams & OpenRouterRouting, options?: { signal?: AbortSignal }): Promise<AsyncIterable<ChatChunkLike>> } };
  /** `signal` is the image's whole-call deadline, and `timeout` the SDK's own, raised above it (openaiAdapter). */
  images: { generate(body: ImageParams, options?: { signal?: AbortSignal; timeout?: number }): Promise<ImagesResponseLike> };
}

/** SDK retries off, as for every client; requests go through the provider Agent's fetch (fetch.ts). */
export function createOpenAIClient(apiKey: string, fetchImpl: typeof fetch = providerFetch): OpenAIClientLike {
  return new OpenAI({ apiKey, maxRetries: 0, fetch: fetchImpl });
}

/**
 * Chat Completions messages. OpenAI's reasoning models take the system prompt in the `developer` role; OpenRouter
 * normalizes `system` for every upstream, so the role is a parameter.
 */
export function chatMessages(req: ProviderCompletionRequest, inline: boolean, systemRole: 'developer' | 'system'): ChatMessage[] {
  const out: ChatMessage[] = req.system ? [{ role: systemRole, content: req.system }] : [];
  for (const m of req.messages) {
    if (m.role === 'assistant') {
      out.push({ role: 'assistant', content: textOf(m.content) });
      continue;
    }
    out.push({
      role: 'user',
      content: m.content.map((p) =>
        p.type === 'text'
          ? { type: 'text' as const, text: p.text }
          : { type: 'image_url' as const, image_url: { url: `data:${p.image.mediaType};base64,${imageData(p.image, inline)}` } },
      ),
    });
  }
  return out;
}

/**
 * Chat Completions params. No temperature or top_p (reasoning models reject non-default sampling); output is capped
 * with max_completion_tokens, which counts reasoning tokens too.
 */
export function openaiChatParams(req: ProviderCompletionRequest, inline: boolean, systemRole: 'developer' | 'system'): ChatParams {
  return {
    model: req.model,
    messages: chatMessages(req, inline, systemRole),
    max_completion_tokens: req.maxOutputTokens,
    ...(req.responseFormat === 'json' ? { response_format: { type: 'json_object' as const } } : {}),
  };
}

/**
 * The streamed form of a chat call (ADR-0111): the same body, with `stream: true`. OpenAI sends usage only when asked
 * (`stream_options.include_usage`), in one last chunk whose `choices` is empty (OpenAI's chat streaming reference, read
 * 2026-10-21). OpenRouter always sends usage, with its cost, in a stream's last chunk, and calls that option deprecated
 * with no effect (its usage-accounting page, read the same day), so it is not asked of OpenRouter.
 */
export function chatStreamParams(body: ChatParams, usage: 'ask' | 'always'): ChatStreamParams {
  return { ...body, stream: true, ...(usage === 'ask' ? { stream_options: { include_usage: true } } : {}) };
}

/** A stream closed by its stop, read as the SDKs' own abort reads. */
const closed = (): Error => Object.assign(new Error('The stream was closed: its call was cut off.'), { name: 'AbortError' });

/**
 * Reads a streamed chat completion into the one answer parseChatCompletion reads (ADR-0111), so a streamed call's usage,
 * cost, served model and host, refusal, content-filter stop and length stop are read exactly as a whole answer's were:
 * - text and refusal are the first choice's deltas, joined;
 * - the finish reason is the last one sent (OpenRouter repeats it on its usage chunk);
 * - the model and OpenRouter's `provider` are the first chunk's that names them, as sent (the gateway makes labels safe);
 * - usage is the chunk that carries it: OpenAI's last chunk (empty `choices`), OpenRouter's last (with `cost`), with
 *   `prompt_tokens_details.cached_tokens` and `cache_write_tokens` as before. Absent when it never came.
 * What it throws: once `signal` has aborted, a stream that ended quietly without its finishing chunk ends as closed (the
 * OpenAI SDK ends a stream it aborted without an error), which the gateway counts as cut off; otherwise a stream with no
 * finishing chunk, a stream `idle` closed because it stalled (StreamIdle: its wait starts as the reading does and again
 * at each chunk), or a finish reason of "error" is streamEndedEarly. An error chunk or a broken stream is
 * streamEndedEarly whether or not the stop came, so it is never read by the error's own body ("may have been billed",
 * ADR-0111 item 8): the gateway counts it as cut off when the stop came, as the gateway reads any "may have been billed"
 * failure after a stop. A stream that finished is returned even when the stop came, the bound closed it, or the stream
 * broke, after its finishing chunk: that answer arrived, and it is settled.
 */
export async function readChatStream(
  stream: AsyncIterable<ChatChunkLike>,
  provider: string,
  signal?: AbortSignal,
  idle?: StreamIdle,
): Promise<{ completion: ChatCompletionLike; chunks: number; usageArrived: boolean }> {
  let id: string | undefined;
  let model: unknown;
  let host: unknown;
  let content = '';
  let refusal = '';
  let finish: string | undefined;
  let usage: ChatCompletionLike['usage'];
  let chunks = 0;
  idle?.restart();
  try {
    for await (const chunk of stream) {
      idle?.restart();
      chunks++;
      if (id === undefined && typeof chunk.id === 'string') id = chunk.id;
      if (model === undefined && chunk.model !== undefined) model = chunk.model;
      if (host === undefined && chunk.provider !== undefined) host = chunk.provider;
      const choice = chunk.choices?.find((c) => (c.index ?? 0) === 0);
      if (typeof choice?.delta?.content === 'string') content += choice.delta.content;
      if (typeof choice?.delta?.refusal === 'string') refusal += choice.delta.refusal;
      if (typeof choice?.finish_reason === 'string' && choice.finish_reason) finish = choice.finish_reason;
      if (chunk.usage) usage = chunk.usage;
    }
  } catch (e) {
    // A stream that broke after its finishing chunk still brought the whole answer: it is settled, below.
    if (finish === undefined || finish === 'error') {
      throw idle?.stalled ? streamStalled(provider, chunks, 'chunk', idle.afterMs, e) : streamEndedEarly(provider, e instanceof Error ? e.message : String(e), e);
    }
  } finally {
    idle?.end();
  }
  if (finish === undefined) {
    if (signal?.aborted) throw closed();
    throw idle?.stalled ? streamStalled(provider, chunks, 'chunk', idle.afterMs) : streamEndedEarly(provider, `no finishing chunk after ${chunks} ${chunks === 1 ? 'chunk' : 'chunks'}`);
  }
  if (finish === 'error') throw streamEndedEarly(provider, 'its last chunk finished with "error"');
  const completion = {
    ...(id !== undefined ? { id } : {}),
    model: model as string,
    ...(host !== undefined ? { provider: host as string } : {}),
    choices: [{ finish_reason: finish, message: { content, ...(refusal ? { refusal } : {}) } }],
    ...(usage ? { usage } : {}),
  } satisfies ChatCompletionLike & { id?: string };
  return { completion, chunks, usageArrived: usage != null };
}

/**
 * A streamed chat call's answer (readChatStream), parsed as a whole one. A stream that finished but whose usage chunk
 * never came was answered, and billed, at a cost byway cannot read: its counts are unknown (NaN), so the gateway settles
 * it at its planning figures, marked as an assumed price (finiteUsage), rather than as free.
 */
export async function completeStreamed(stream: AsyncIterable<ChatChunkLike>, provider: string, signal: AbortSignal | undefined, idle?: StreamIdle): Promise<Omit<ProviderCompletion, 'requestBody'>> {
  const { completion, chunks, usageArrived } = await readChatStream(stream, provider, signal, idle);
  const parsed = parseChatCompletion(completion);
  return {
    ...parsed,
    ...(usageArrived ? {} : { usage: { inputTokens: Number.NaN, outputTokens: Number.NaN }, usageMissing: true as const }),
    responseBody: plain({ ...completion, streamed: { chunks, usage: usageArrived } }),
  };
}

export function parseChatCompletion(res: ChatCompletionLike): Omit<ProviderCompletion, 'requestBody'> {
  const choice = res.choices[0];
  const details = res.usage?.prompt_tokens_details;
  // OpenAI's prompt-caching guide (read 2026-10-21): cached_tokens "counts billed reads and excludes tokens charged as
  // writes", and its worked example bills as ordinary input the input count less cached_tokens and cache_write_tokens.
  // tokenCost does the same (prices.ts): reads and writes at their own rates, the rest at the input rate. OpenRouter
  // reports the same two fields.
  const usage: TokenBreakdown = {
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    cacheReadTokens: details?.cached_tokens ?? 0,
    cacheWriteTokens: details?.cache_write_tokens ?? 0,
  };
  // Both are declines (ADR-0102): the model's own refusal, whose words are its stated reason, and a content-filter stop.
  const declined = choice?.message.refusal ? { reason: choice.message.refusal } : choice?.finish_reason === 'content_filter' ? { reason: 'content filter' } : undefined;
  const refusal = choice?.message.refusal ? `declined: ${choice.message.refusal}` : declined ? 'declined (content filter)' : undefined;
  return {
    text: choice?.message.content ?? '',
    servedModel: res.model,
    usage,
    ...(typeof res.usage?.cost === 'number' ? { reportedCostUsd: res.usage.cost } : {}),
    ...(typeof res.provider === 'string' ? { upstreamProvider: res.provider } : {}),
    ...(refusal ? { refusal } : {}),
    ...(declined ? { declined } : {}),
    // 'length': the answer hit max_completion_tokens (OpenRouter normalizes every upstream's limit stop to it too).
    ...(choice?.finish_reason === 'length' ? { truncated: true } : {}),
    responseBody: plain(res),
  };
}

export function openaiImageParams(req: ProviderImageRequest): ImageParams {
  // Medium quality: a page's supporting imagery, at a cost the budget estimate can bound.
  return { model: req.model, prompt: req.prompt, size: req.size, quality: 'medium', n: 1, output_format: 'png' };
}

const FORMAT_TYPES: Record<string, MediaType> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

/**
 * An images answer. One that carries no image is returned as a no-image result with its usage and a refusal-like reason
 * (the gateway ledgers it, then refuses, not retryable), never as a synthetic 502 that would be retried and paid for again
 * with nothing ledgered (ENG-5).
 */
export function parseImagesResponse(res: ImagesResponseLike, model: string): Omit<ProviderImage, 'requestBody'> {
  const b64 = res.data?.[0]?.b64_json;
  const body = plain(res) as { data?: { b64_json?: string }[] };
  for (const d of body.data ?? []) if (d.b64_json) d.b64_json = `[${d.b64_json.length} base64 chars, stored as an artifact]`;
  const usage = { inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0, units: b64 ? 1 : 0 };
  if (!b64) return { bytes: new Uint8Array(), mediaType: 'image/png', servedModel: model, usage, refusal: 'returned no image', responseBody: body };
  // The SDK types usage as optional ("For gpt-image-1 only"): an image that came without it was billed at a cost byway
  // cannot read, so its counts are unknown and the gateway settles it at its planning figures, marked (B-147).
  const missing = res.usage == null;
  return {
    bytes: Buffer.from(b64, 'base64'),
    mediaType: FORMAT_TYPES[res.output_format ?? 'png'] ?? 'image/png',
    servedModel: model,
    usage: missing ? { inputTokens: Number.NaN, outputTokens: Number.NaN, units: 1 } : usage,
    ...(missing ? { usageMissing: true as const } : {}),
    responseBody: body,
  };
}

/**
 * The error codes OpenAI's Images API answers with (HTTP 400) when its safety system blocks a request, before or after
 * the image is made: `moderation_blocked` for the GPT image models, `content_policy_violation` for DALL·E.
 *
 * Read again on 2026-10-18 (developers.openai.com/api/docs/guides/image-generation, "Handling blocked requests and other
 * errors"): OpenAI now documents `moderation_blocked`, with `error.type` "image_generation_user_error" and an optional
 * `error.moderation_details` whose `moderation_stage` is `input`, `output` or `unknown`. The error body is stored as the
 * decline's response, which its ledger entry names by hash, so the stage that blocked it is on record.
 * `content_policy_violation` and the HTTP status are not in OpenAI's documentation; they come from community reports (the
 * D1 build). Nor is whether a block is billed: neither that guide nor the pricing and error-code pages say, so recording
 * a block at no cost (below) is still an assumption (backlog).
 */
const MODERATION_CODES = new Set(['moderation_blocked', 'content_policy_violation']);

/**
 * An Images API error that is OpenAI's safety system declining the image, read as a decline with no image (ADR-0102), so
 * the gateway records it and asks once more, as for every provider's decline. OpenAI reports no usage with it, so none is
 * assumed: it is recorded at no cost, with its error body as the evidence. Undefined for any other error.
 */
export function moderationDecline(err: unknown, model: string): Omit<ProviderImage, 'requestBody'> | undefined {
  const e = err as { status?: unknown; code?: unknown; error?: { code?: unknown; message?: unknown } } | null;
  const code = typeof e?.code === 'string' ? e.code : typeof e?.error?.code === 'string' ? e.error.code : undefined;
  if (e?.status !== 400 || code === undefined || !MODERATION_CODES.has(code)) return undefined;
  return {
    bytes: new Uint8Array(),
    mediaType: 'image/png',
    servedModel: model,
    usage: { inputTokens: 0, outputTokens: 0, units: 0 },
    refusal: `declined (${code})`,
    declined: { reason: code },
    responseBody: plain({ status: 400, error: e.error ?? { code } }),
  };
}

/** The OpenAI chat call as sent: streamed, with its usage asked for (chatStreamParams). */
export function openaiStreamParams(req: ProviderCompletionRequest, inline: boolean): ChatStreamParams {
  return chatStreamParams(openaiChatParams(req, inline, 'developer'), 'ask');
}

/**
 * How far above an image's wait the SDK's own request timeout is set. The SDK gives up on a request at ten minutes by
 * default (openai 7.28.0), under the 15 and 20 minutes an image may wait; its deadline (req.deadline) does the timing.
 */
export const IMAGE_SDK_TIMEOUT_ABOVE_WAIT_MS = 60_000;

export function openaiAdapter(opts: { client: OpenAIClientLike }): ProviderAdapter {
  return {
    id: 'openai',
    // Chat calls are streamed so a stop can close them (ADR-0111); image calls are not cut off.
    cutsOff: { complete: true },
    // An image is answered whole: its model's wait bounds the whole call (the waits design of 2026-10-22).
    answersWhole: { image: true },
    async complete(req) {
      // The SDK is handed the stop and the request's bound on a stalled stream together (StreamIdle, streamIdleMs).
      const idle = new StreamIdle(req.signal, req.streamIdleMs);
      const stream = await opts.client.chat.completions.create(openaiStreamParams(req, true), { signal: idle.signal });
      return { ...(await completeStreamed(stream, 'openai', req.signal, idle)), requestBody: openaiStreamParams(req, false) };
    },
    async image(req) {
      const params = openaiImageParams(req);
      // The image's wait governs (its deadline), with the SDK's own timeout raised above it; never the run's stop.
      const deadline = req.deadline;
      let res: ImagesResponseLike;
      try {
        res = await (deadline ? opts.client.images.generate(params, { signal: deadline.signal, timeout: deadline.afterMs + IMAGE_SDK_TIMEOUT_ABOVE_WAIT_MS }) : opts.client.images.generate(params));
      } catch (e) {
        const declined = moderationDecline(e, req.model);
        if (declined) return { ...declined, requestBody: params };
        throw e;
      }
      return { ...parseImagesResponse(res, req.model), requestBody: params };
    },
  };
}
