import Anthropic from '@anthropic-ai/sdk';
import type { TokenBreakdown } from '../prices.ts';
import { imageData, plain, type ProviderAdapter, type ProviderCompletion, type ProviderCompletionRequest } from './types.ts';

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Block = Anthropic.Beta.Messages.BetaContentBlockParam;

/** The fields of a Messages API response the adapter reads (a structural subset of BetaMessage). */
export interface AnthropicMessageLike {
  model: string;
  content: ReadonlyArray<{ type: string; text?: string }>;
  stop_reason: string | null;
  stop_details?: { category?: string | null } | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    iterations?: ReadonlyArray<{
      type: string;
      model?: string | null;
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    }> | null;
  };
}

/** The slice of the Anthropic SDK client the adapter uses. The real client satisfies it; tests pass a fake. */
export interface AnthropicClientLike {
  beta: { messages: { stream(body: Params): { finalMessage(): Promise<AnthropicMessageLike> } } };
}

/** SDK retries off: the gateway owns retries, so attempts are counted once and backoff is one policy. */
export function createAnthropicClient(apiKey: string): AnthropicClientLike {
  return new Anthropic({ apiKey, maxRetries: 0 });
}

/**
 * Server-side refusal fallback (beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`): when a Claude 5.x
 * safety classifier declines, the API re-runs the request on Anthropic's recommended fallback model inside the same
 * call, routed by refusal category. The served model is whatever the response reports, and the ledger records it.
 */
export const REFUSAL_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export interface AnthropicAdapterOptions {
  client: AnthropicClientLike;
  /** Opt into server-side refusal fallbacks (default true). */
  refusalFallback?: boolean;
}

/**
 * Build Messages API params. No temperature, top_p or top_k: Claude 4.7+ models reject non-default sampling
 * parameters. No thinking config: Claude Opus 5.5 and Fable 5.1 think adaptively and reject a disabled or budgeted
 * config, and Sonnet 5.5 defaults to adaptive. Effort stays at each model's default.
 */
export function anthropicParams(req: ProviderCompletionRequest, inline: boolean, refusalFallback: boolean): Params {
  const messages = req.messages.map((m) => ({
    role: m.role,
    content: m.content.map(
      (p): Block =>
        p.type === 'text'
          ? { type: 'text', text: p.text }
          : { type: 'image', source: { type: 'base64', media_type: p.image.mediaType, data: imageData(p.image, inline) } },
    ),
  }));
  return {
    model: req.model,
    max_tokens: req.maxOutputTokens,
    messages,
    ...(req.system ? { system: req.system } : {}),
    ...(refusalFallback ? { betas: [REFUSAL_FALLBACK_BETA], fallbacks: 'default' as const } : {}),
  };
}

type IterationUsage = NonNullable<AnthropicMessageLike['usage']['iterations']>[number];

/**
 * Stop reasons that mean the answer was cut off: `max_tokens` (it reached max_tokens) and
 * `model_context_window_exceeded` (it filled the model's context window first). Either way the text is incomplete.
 */
const TRUNCATED = new Set(['max_tokens', 'model_context_window_exceeded']);

function breakdown(u: AnthropicMessageLike['usage'] | IterationUsage): TokenBreakdown {
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  // Anthropic's input_tokens excludes cache reads and writes; the contract's inputTokens counts everything sent.
  return { inputTokens: (u.input_tokens ?? 0) + cacheWrite + cacheRead, outputTokens: u.output_tokens ?? 0, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite };
}

export function parseAnthropicMessage(msg: AnthropicMessageLike, requestedModel: string): Omit<ProviderCompletion, 'requestBody'> {
  const text = msg.content.flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('');
  // Top-level usage covers only the attempt that produced the message; iterations list every billed attempt and the
  // model that ran it, so a refusal fallback is priced per model.
  const attempts = (msg.usage.iterations ?? []).filter((it) => it.type === 'message' || it.type === 'fallback_message');
  const usageByModel = attempts.length > 1 || attempts.some((it) => it.type === 'fallback_message')
    ? attempts.map((it) => ({ model: it.model ?? requestedModel, usage: breakdown(it) }))
    : undefined;
  const usage = usageByModel
    ? usageByModel.reduce<TokenBreakdown>(
        (acc, { usage: u }) => ({
          inputTokens: acc.inputTokens + u.inputTokens,
          outputTokens: acc.outputTokens + u.outputTokens,
          cacheReadTokens: (acc.cacheReadTokens ?? 0) + (u.cacheReadTokens ?? 0),
          cacheWriteTokens: (acc.cacheWriteTokens ?? 0) + (u.cacheWriteTokens ?? 0),
        }),
        { inputTokens: 0, outputTokens: 0 },
      )
    : breakdown(msg.usage);
  return {
    text,
    servedModel: msg.model,
    usage,
    ...(usageByModel ? { usageByModel } : {}),
    ...(msg.stop_reason === 'refusal' ? { refusal: `declined (${msg.stop_details?.category ?? 'policy'})` } : {}),
    ...(msg.stop_reason !== null && TRUNCATED.has(msg.stop_reason) ? { truncated: true } : {}),
    responseBody: plain(msg),
  };
}

export function anthropicAdapter(opts: AnthropicAdapterOptions): ProviderAdapter {
  const fallback = opts.refusalFallback ?? true;
  return {
    id: 'anthropic',
    async complete(req) {
      // Streaming keeps long builds (large max_tokens) clear of HTTP timeouts; finalMessage() assembles the result.
      const msg = await opts.client.beta.messages.stream(anthropicParams(req, true, fallback)).finalMessage();
      return { ...parseAnthropicMessage(msg, req.model), requestBody: anthropicParams(req, false, fallback) };
    },
  };
}
