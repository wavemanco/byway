import OpenAI from 'openai';
import { GatewayError } from '@byway/contracts';
import { openaiChatParams, parseChatCompletion, type OpenAIClientLike, type OpenRouterRouting } from './openai.ts';
import type { ProviderAdapter, ProviderCompletionRequest } from './types.ts';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** OpenRouter speaks the OpenAI Chat Completions API, so the OpenAI SDK is the client. */
export function createOpenRouterClient(apiKey: string): OpenAIClientLike {
  return new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL, maxRetries: 0, defaultHeaders: { 'X-Title': 'byway' } });
}

/**
 * Pin the upstream host: `only` names one provider slug and `allow_fallbacks: false` forbids OpenRouter from moving the
 * call elsewhere, so the model that answers is the one the profile names, on the host it names.
 */
export function openrouterParams(req: ProviderCompletionRequest, inline: boolean, pin: string) {
  const routing: Required<OpenRouterRouting> = { provider: { only: [pin], allow_fallbacks: false } };
  return { ...openaiChatParams(req, inline, 'system'), ...routing };
}

export function openrouterAdapter(opts: { client: OpenAIClientLike; pins: Readonly<Record<string, string>> }): ProviderAdapter {
  return {
    id: 'openrouter',
    async complete(req) {
      const pin = opts.pins[req.model];
      // An unpinned model could be served by any host; refuse rather than route blind.
      if (!pin) throw new GatewayError('invalid-request', `openrouter model ${req.model} has no pinned upstream provider`);
      const res = await opts.client.chat.completions.create(openrouterParams(req, true, pin));
      const parsed = parseChatCompletion(res);
      // OpenRouter names the serving host in `provider`; with fallbacks off it can only be the pin.
      return { ...parsed, upstreamProvider: parsed.upstreamProvider ?? pin, requestBody: openrouterParams(req, false, pin) };
    },
  };
}
