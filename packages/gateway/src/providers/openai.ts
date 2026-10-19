import OpenAI from 'openai';
import type { MediaType } from '@byway/contracts';
import type { TokenBreakdown } from '../prices.ts';
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
    prompt_tokens_details?: { cached_tokens?: number | null } | null;
    cost?: number | null;
  } | null;
}

export interface ImagesResponseLike {
  data?: ReadonlyArray<{ b64_json?: string | null }> | null;
  output_format?: string | null;
  usage?: { input_tokens: number; output_tokens: number } | null;
}

/** The slice of the OpenAI SDK client the adapters use (OpenRouter is reached through the same SDK). */
export interface OpenAIClientLike {
  chat: { completions: { create(body: ChatParams & OpenRouterRouting): Promise<ChatCompletionLike> } };
  images: { generate(body: ImageParams): Promise<ImagesResponseLike> };
}

export function createOpenAIClient(apiKey: string): OpenAIClientLike {
  return new OpenAI({ apiKey, maxRetries: 0 });
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

export function parseChatCompletion(res: ChatCompletionLike): Omit<ProviderCompletion, 'requestBody'> {
  const choice = res.choices[0];
  const cached = res.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const usage: TokenBreakdown = { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0, cacheReadTokens: cached };
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
  return {
    bytes: Buffer.from(b64, 'base64'),
    mediaType: FORMAT_TYPES[res.output_format ?? 'png'] ?? 'image/png',
    servedModel: model,
    usage,
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

export function openaiAdapter(opts: { client: OpenAIClientLike }): ProviderAdapter {
  return {
    id: 'openai',
    async complete(req) {
      const res = await opts.client.chat.completions.create(openaiChatParams(req, true, 'developer'));
      return { ...parseChatCompletion(res), requestBody: openaiChatParams(req, false, 'developer') };
    },
    async image(req) {
      const params = openaiImageParams(req);
      let res: ImagesResponseLike;
      try {
        res = await opts.client.images.generate(params);
      } catch (e) {
        const declined = moderationDecline(e, req.model);
        if (declined) return { ...declined, requestBody: params };
        throw e;
      }
      return { ...parseImagesResponse(res, req.model), requestBody: params };
    },
  };
}
