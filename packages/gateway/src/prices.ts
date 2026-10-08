import type { ProviderId, Usage } from '@byway/contracts';

/**
 * One dated price for one model. Prices change on announced dates (Gemini 3.8 Flash's introductory price ends on
 * 2026-12-31), so a model may have several rows; the row in force on the call's date applies.
 */
export interface PriceRow {
  provider: ProviderId;
  model: string;
  /** First day (UTC, inclusive) this row applies; omitted for "since before we started recording". */
  from?: string;
  /** USD per million input tokens (text input for image models). */
  inputPerMTok: number;
  /** USD per million output tokens (image output tokens for token-priced image models; includes thinking tokens). */
  outputPerMTok: number;
  /** USD per million cache-read input tokens. */
  cacheReadPerMTok?: number;
  /** USD per million 5-minute cache-write input tokens. */
  cacheWritePerMTok?: number;
  /** Image models priced per image: USD per generated image at the 1K size the gateway requests. */
  perImageUsd?: number;
  /**
   * Image models priced by output tokens: an upper bound on output tokens per image, used only for the pre-call
   * budget estimate. The actual cost comes from the usage the provider reports.
   */
  estimatedOutputTokensPerImage?: number;
  /** Video models and helper endpoints priced by time: USD per second of video made (or of compute, for helpers). */
  perSecondUsd?: number;
  /** Where the number was read, and when. */
  source: string;
}

const ANTHROPIC = 'platform.claude.com/docs/en/about-claude/pricing, read 2026-10-07';
const OPENAI = 'developers.openai.com/api/docs/pricing, read 2026-10-07';
const GOOGLE = 'ai.google.dev/gemini-api/docs/pricing (page dated 2026-10-07), read 2026-10-07';
const OPENROUTER = 'openrouter.ai/api/v1/models (pricing.prompt / pricing.completion), read 2026-10-07';

export const PRICES: readonly PriceRow[] = [
  // Anthropic, first-party API, global routing (no inference_geo multiplier).
  // claude-fable-5-1: $10 / $50, cache hits $0.25 (0.025x), 5m cache writes $12.50. Source: ANTHROPIC, 2026-10-07.
  { provider: 'anthropic', model: 'claude-fable-5-1', inputPerMTok: 10, outputPerMTok: 50, cacheReadPerMTok: 0.25, cacheWritePerMTok: 12.5, source: ANTHROPIC },
  // claude-opus-5-5: $4 / $20, cache hits $0.20 (0.05x), 5m cache writes $5. Source: ANTHROPIC, 2026-10-07.
  { provider: 'anthropic', model: 'claude-opus-5-5', inputPerMTok: 4, outputPerMTok: 20, cacheReadPerMTok: 0.2, cacheWritePerMTok: 5, source: ANTHROPIC },
  // claude-sonnet-5-5: $2 / $10, 5m cache writes $2.50. The pricing table lists cache hits at $0.20 while its prose says
  // $0.10 (0.05x); we record the table's higher figure so estimates err high. Source: ANTHROPIC, 2026-10-07.
  { provider: 'anthropic', model: 'claude-sonnet-5-5', inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.2, cacheWritePerMTok: 2.5, source: ANTHROPIC },
  // Models that `fallbacks: "default"` may serve after a refusal (cyber-category refusals go to Opus 4.8), so their
  // tokens are priced correctly in the ledger. claude-opus-5 and claude-opus-4-8: $5 / $25. Source: ANTHROPIC, 2026-10-07.
  { provider: 'anthropic', model: 'claude-opus-5', inputPerMTok: 5, outputPerMTok: 25, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25, source: ANTHROPIC },
  { provider: 'anthropic', model: 'claude-opus-4-8', inputPerMTok: 5, outputPerMTok: 25, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25, source: ANTHROPIC },

  // OpenAI, Standard processing.
  // gpt-6-astra: $10 / $50, cached input $1. Source: OPENAI and developers.openai.com/api/docs/models/gpt-6-astra, 2026-10-07.
  { provider: 'openai', model: 'gpt-6-astra', inputPerMTok: 10, outputPerMTok: 50, cacheReadPerMTok: 1, source: OPENAI },
  // gpt-6.1-sol: $2 / $10, cached input $0.10. Source: OPENAI and developers.openai.com/api/docs/models/gpt-6.1-sol, 2026-10-07.
  { provider: 'openai', model: 'gpt-6.1-sol', inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.1, source: OPENAI },
  // gpt-6-luna: $0.10 / $0.50. Source: OPENAI, 2026-10-07.
  { provider: 'openai', model: 'gpt-6-luna', inputPerMTok: 0.1, outputPerMTok: 0.5, source: OPENAI },
  // gpt-image-2.5-flare and gpt-image-2.5-sunburst: text input $5, image output $30 per 1M tokens. OpenAI publishes no
  // per-image figure for these models (it points to a calculator), so 8,000 output tokens per image (~$0.24) is our
  // planning bound for the pre-call estimate only; the ledger uses the usage the API returns. Source: OPENAI, 2026-10-07.
  { provider: 'openai', model: 'gpt-image-2.5-flare', inputPerMTok: 5, outputPerMTok: 30, estimatedOutputTokensPerImage: 8000, source: OPENAI },
  { provider: 'openai', model: 'gpt-image-2.5-sunburst', inputPerMTok: 5, outputPerMTok: 30, estimatedOutputTokensPerImage: 8000, source: OPENAI },

  // Google Gemini API, paid tier, Standard, prompts <= 200k tokens (the product's prompts stay well under).
  // gemini-3.1-pro-preview: $2 / $12 (> 200k: $4 / $18). Source: GOOGLE, 2026-10-07.
  { provider: 'google', model: 'gemini-3.1-pro-preview', inputPerMTok: 2, outputPerMTok: 12, source: GOOGLE },
  // gemini-3.8-flash: $0.75 / $3.75 through 2026-12-31, then $1.50 / $7.50 from 2027-01-01. Source: GOOGLE, 2026-10-07.
  { provider: 'google', model: 'gemini-3.8-flash', inputPerMTok: 0.75, outputPerMTok: 3.75, source: GOOGLE },
  { provider: 'google', model: 'gemini-3.8-flash', from: '2027-01-01', inputPerMTok: 1.5, outputPerMTok: 7.5, source: GOOGLE },
  // gemini-nano-banana-2.1: input $1.50 per 1M tokens; output $0.0336 per 1K image. Source: GOOGLE, 2026-10-07.
  { provider: 'google', model: 'gemini-nano-banana-2.1', inputPerMTok: 1.5, outputPerMTok: 0, perImageUsd: 0.0336, source: GOOGLE },

  // OpenRouter, pinned to the first-party provider (same list price as the provider's own API).
  // anthropic/claude-fable-5.1: $10 / $50. Source: OPENROUTER, 2026-10-07.
  { provider: 'openrouter', model: 'anthropic/claude-fable-5.1', inputPerMTok: 10, outputPerMTok: 50, source: OPENROUTER },
  // anthropic/claude-opus-5.5: $4 / $20. Source: OPENROUTER, 2026-10-07.
  { provider: 'openrouter', model: 'anthropic/claude-opus-5.5', inputPerMTok: 4, outputPerMTok: 20, source: OPENROUTER },
  // anthropic/claude-sonnet-5.5: $2 / $10. Source: OPENROUTER, 2026-10-07.
  { provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5', inputPerMTok: 2, outputPerMTok: 10, source: OPENROUTER },

  // fal.ai video for C5 relay links (ADR-0069), priced per second of video; no token charges.
  // kling-video/v2.5-turbo/pro/image-to-video: "For 5s video your request will cost $0.35. For every additional second
  // you will be charged $0.07." The model makes 5 s or 10 s clips, so this is $0.07 per second either way.
  {
    provider: 'fal',
    model: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    inputPerMTok: 0,
    outputPerMTok: 0,
    perSecondUsd: 0.07,
    source: 'fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video, read 2026-10-07',
  },
  // kling-video/v3/pro/image-to-video: "$0.112 (audio off)" per second of video ($0.168 with audio, $0.196 with voice
  // control). The gateway always sends generate_audio: false.
  {
    provider: 'fal',
    model: 'fal-ai/kling-video/v3/pro/image-to-video',
    inputPerMTok: 0,
    outputPerMTok: 0,
    perSecondUsd: 0.112,
    source: 'fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video, read 2026-10-07',
  },
  // ffmpeg-api/extract-frame (the relay anchor: a clip's last frame): "Your request will cost $0.0002 per second" of
  // compute. fal does not report the seconds to the client; the gateway charges a fixed upper bound (providers/fal.ts).
  { provider: 'fal', model: 'fal-ai/ffmpeg-api/extract-frame', inputPerMTok: 0, outputPerMTok: 0, perSecondUsd: 0.0002, source: 'fal.ai/models/fal-ai/ffmpeg-api/extract-frame, read 2026-10-07' },

  // The demo-mode mock costs nothing.
  { provider: 'mock', model: 'mock-big', inputPerMTok: 0, outputPerMTok: 0, source: 'byway mock provider, 2026-10-07' },
  { provider: 'mock', model: 'mock-mid', inputPerMTok: 0, outputPerMTok: 0, source: 'byway mock provider, 2026-10-07' },
  { provider: 'mock', model: 'mock-image', inputPerMTok: 0, outputPerMTok: 0, perImageUsd: 0, source: 'byway mock provider, 2026-10-07' },
  { provider: 'mock', model: 'mock-video', inputPerMTok: 0, outputPerMTok: 0, perSecondUsd: 0, source: 'byway mock provider, 2026-10-07' },
];

/** The row in force for a model on a date, or undefined when the model has no price. */
export function priceFor(table: readonly PriceRow[], provider: ProviderId, model: string, at: Date): PriceRow | undefined {
  const day = at.toISOString().slice(0, 10);
  let best: PriceRow | undefined;
  for (const row of table) {
    if (row.provider !== provider || row.model !== model) continue;
    if (row.from !== undefined && row.from > day) continue;
    if (!best || (row.from ?? '') > (best.from ?? '')) best = row;
  }
  return best;
}

/** Detailed token counts some providers report, beyond the contract's Usage. */
export interface TokenBreakdown extends Usage {
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** USD cost of a completion's tokens. Cache tokens are priced separately when the row lists their rates. */
export function tokenCost(price: PriceRow, usage: TokenBreakdown): number {
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const plainInput = Math.max(0, usage.inputTokens - cacheRead - cacheWrite);
  const usd =
    plainInput * price.inputPerMTok +
    cacheRead * (price.cacheReadPerMTok ?? price.inputPerMTok) +
    cacheWrite * (price.cacheWritePerMTok ?? price.inputPerMTok) +
    usage.outputTokens * price.outputPerMTok;
  return roundUsd(usd / 1_000_000);
}

/** Round to a millionth of a dollar: enough precision for single calls, and stable in the hash-chained ledger. */
export function roundUsd(usd: number): number {
  return Math.round(usd * 1_000_000) / 1_000_000;
}
