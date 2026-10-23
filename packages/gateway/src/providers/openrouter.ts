import OpenAI from 'openai';
import { GatewayError } from '@byway/contracts';
import { chatStreamParams, completeStreamed, openaiChatParams, type OpenAIClientLike, type OpenRouterRouting } from './openai.ts';
import { providerFetch } from './fetch.ts';
import { StreamIdle } from './stream.ts';
import type { ProviderAdapter, ProviderCompletionRequest } from './types.ts';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** OpenRouter speaks the OpenAI Chat Completions API, so the OpenAI SDK is the client, on the provider Agent's fetch (fetch.ts). */
export function createOpenRouterClient(apiKey: string, fetchImpl: typeof fetch = providerFetch): OpenAIClientLike {
  return new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL, maxRetries: 0, defaultHeaders: { 'X-Title': 'byway' }, fetch: fetchImpl });
}

/**
 * Pin the upstream host: `only` names one provider slug and `allow_fallbacks: false` forbids OpenRouter from moving the
 * call elsewhere, so the model that answers is the one the profile names, on the host it names. Streamed (ADR-0111):
 * OpenRouter sends usage and cost in the stream's last chunk without being asked (chatStreamParams).
 */
export function openrouterParams(req: ProviderCompletionRequest, inline: boolean, pin: string) {
  const routing: Required<OpenRouterRouting> = { provider: { only: [pin], allow_fallbacks: false } };
  return { ...chatStreamParams(openaiChatParams(req, inline, 'system'), 'always'), ...routing };
}

export function openrouterAdapter(opts: { client: OpenAIClientLike; pins: Readonly<Record<string, string>> }): ProviderAdapter {
  return {
    id: 'openrouter',
    // OpenRouter's streaming page (read 2026-10-21): aborting a stream "immediately stops model processing and billing"
    // for the providers it lists, Anthropic among them, and a request that is not streamed is billed in full (ADR-0111).
    cutsOff: { complete: true },
    async complete(req) {
      const pin = opts.pins[req.model];
      // An unpinned model could be served by any host; refuse rather than route blind.
      if (!pin) throw new GatewayError('invalid-request', `openrouter model ${req.model} has no pinned upstream provider`);
      // The SDK is handed the stop and the request's bound on a stalled stream together (StreamIdle, streamIdleMs).
      const idle = new StreamIdle(req.signal, req.streamIdleMs);
      const stream = await opts.client.chat.completions.create(openrouterParams(req, true, pin), { signal: idle.signal });
      const parsed = await completeStreamed(stream, 'openrouter', req.signal, idle);
      // OpenRouter names the serving host in `provider`; with fallbacks off it can only be the pin.
      return { ...parsed, upstreamProvider: parsed.upstreamProvider ?? pin, requestBody: openrouterParams(req, false, pin) };
    },
  };
}
