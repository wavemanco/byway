import Anthropic from '@anthropic-ai/sdk';
import type { TokenBreakdown } from '../prices.ts';
import { stalledDetail, streamEndedEarly, StreamIdle } from './stream.ts';
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

/**
 * A streamed answer as the adapter reads it: the slice of the SDK's MessageStream it uses. `on` adds a listener for the
 * SDK's own events: 'connect' (the response began) and 'streamEvent' (an event came, pings aside) restart the bound on a
 * stalled stream (StreamIdle), and 'message' is the whole message, sent as its message_stop arrives. Optional, so a fake
 * that answers at once need not have it.
 */
export interface AnthropicStreamLike {
  finalMessage(): Promise<AnthropicMessageLike>;
  on?(event: 'connect' | 'streamEvent', listener: () => void): unknown;
  on?(event: 'message', listener: (message: AnthropicMessageLike) => void): unknown;
}

/**
 * The slice of the Anthropic SDK client the adapter uses. The real client satisfies it; tests pass a fake. `signal`
 * closes the stream when it aborts (the SDK then rejects finalMessage with its APIUserAbortError; ADR-0111). It is always
 * given: it also closes a stream that has stalled (StreamIdle).
 */
export interface AnthropicClientLike {
  beta: { messages: { stream(body: Params, options?: { signal?: AbortSignal }): AnthropicStreamLike } };
}

/** SDK retries off: the gateway owns retries, so attempts are counted once and backoff is one policy. */
export function createAnthropicClient(apiKey: string): AnthropicClientLike {
  return new Anthropic({ apiKey, maxRetries: 0 });
}

/**
 * The adapter takes a client and nothing else. In particular it has no way to ask for Anthropic's server-side refusal
 * fallback, which re-runs a declined request on another Claude model inside the same call: no provider may answer with
 * another model than the one the person chose (ADR-0102, the owner's decision D1). A decline comes back as a decline,
 * and the gateway asks the same model once more.
 */
export interface AnthropicAdapterOptions {
  client: AnthropicClientLike;
}

/**
 * Build Messages API params. No temperature, top_p or top_k: Claude 4.7+ models reject non-default sampling
 * parameters. Thinking is adaptive, as Claude Opus 5.5, Sonnet 5.5 and Fable 5.1 think by default (they reject a
 * disabled or budgeted config), with its display "summarized": the default, "omitted", streams only pings while the
 * model thinks, so a long think would read as silence and be cut off at the model's wait (StreamIdle), then sent again
 * and paid twice. The owner chose it on 2026-10-22, "Ask for summaries (Recommended)": display "controls visibility
 * only - thinking happens and is billed the same under every setting" (the claude-api reference, read 2026-10-22;
 * @anthropic-ai/sdk 0.131.0's type docs, which say the default is "summarized", are stale). The summary is not part of
 * the answer: only text blocks are read (parseAnthropicMessage). Effort stays at each model's default. No beta header
 * and no fallback field: the model asked for is the only one that may answer (ADR-0102).
 */
export function anthropicParams(req: ProviderCompletionRequest, inline: boolean): Params {
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
    thinking: { type: 'adaptive', display: 'summarized' },
    ...(req.system ? { system: req.system } : {}),
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
  // model that ran it. byway asks for no fallback (ADR-0102), so one attempt is expected; a response that lists several
  // is still priced per model.
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
    // A refusal stop is a decline: the category, when Anthropic names one, is its stated reason (ADR-0102).
    ...(msg.stop_reason === 'refusal'
      ? { refusal: `declined (${msg.stop_details?.category ?? 'policy'})`, declined: msg.stop_details?.category ? { reason: msg.stop_details.category } : {} }
      : {}),
    ...(msg.stop_reason !== null && TRUNCATED.has(msg.stop_reason) ? { truncated: true } : {}),
    responseBody: plain(msg),
  };
}

export function anthropicAdapter(opts: AnthropicAdapterOptions): ProviderAdapter {
  return {
    id: 'anthropic',
    // A streamed answer is cut off by closing its stream (ADR-0111). Anthropic's streaming page does not say what a
    // closed stream bills; the gateway counts a call cut off after it was sent as "may have been billed".
    cutsOff: { complete: true },
    async complete(req) {
      // The SDK is handed the stop and the request's bound on a stalled stream together (StreamIdle, streamIdleMs).
      const idle = new StreamIdle(req.signal, req.streamIdleMs);
      // Streaming keeps long builds (large max_tokens) clear of HTTP timeouts; finalMessage() assembles the result.
      const stream = opts.client.beta.messages.stream(anthropicParams(req, true), { signal: idle.signal });
      let events = 0;
      let whole: AnthropicMessageLike | undefined;
      stream.on?.('connect', () => idle.restart());
      stream.on?.('streamEvent', () => {
        events++;
        idle.restart();
      });
      stream.on?.('message', (message) => {
        whole = message;
      });
      let msg: AnthropicMessageLike;
      try {
        msg = await stream.finalMessage();
      } catch (e) {
        // The whole message arrived (its message_stop) before the stream was closed, by its stop or its bound, or broke:
        // that answer is settled, as a streamed OpenAI or OpenRouter answer that finished is (ADR-0111). The SDK rejects
        // finalMessage when the abort lands after the last event but before it has read the stream's end.
        if (whole) msg = whole;
        else if (idle.stalled && !req.signal?.aborted) throw streamEndedEarly('anthropic', stalledDetail(events, 'event', idle.afterMs), e);
        else throw e;
      } finally {
        idle.end();
      }
      return { ...parseAnthropicMessage(msg, req.model), requestBody: anthropicParams(req, false) };
    },
  };
}
