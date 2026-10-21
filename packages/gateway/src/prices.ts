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
  /**
   * USD per million output tokens; includes thinking tokens. For an image model priced by output tokens, its image output
   * tokens. For an image model priced per image, the text and thinking tokens of its answer, which are billed on top of
   * the image (Gemini: providers/google.ts parseGoogleImage).
   */
  outputPerMTok: number;
  /** USD per million cache-read input tokens. */
  cacheReadPerMTok?: number;
  /** USD per million cache-write input tokens: Anthropic's 5-minute writes, OpenAI's 30-minute writes. */
  cacheWritePerMTok?: number;
  /** Image models priced per image: USD per generated image at the 1K size the gateway requests. */
  perImageUsd?: number;
  /**
   * Image models: the output tokens per image, priced at `outputPerMTok`, that the pre-call budget estimate plans for (a
   * planning number, not a bound: ADR-0091 decision 4). The actual cost comes from the usage the provider reports.
   */
  estimatedOutputTokensPerImage?: number;
  /** Video models and helper endpoints priced by time: USD per second of video made (or of compute, for helpers). */
  perSecondUsd?: number;
  /** Where the number was read, and when. */
  source: string;
}

// Every row below was read again on 2026-10-18, before the first live run. Each figure matched its page then, except two
// that byway changed: claude-sonnet-5-5's cache hits, and gemini-nano-banana-2.1's text and thinking output, which
// byway did not charge before. The OpenAI rows lacked a rate their page lists, the cache writes OpenAI charges by
// default; it was added when the page was read again on 2026-10-21.
const ANTHROPIC = 'platform.claude.com/docs/en/about-claude/pricing, read 2026-10-18';
const OPENAI = 'developers.openai.com/api/docs/pricing, read 2026-10-18 and again 2026-10-21';
const GOOGLE = 'ai.google.dev/gemini-api/docs/pricing (page dated 2026-10-16), read 2026-10-18';
const OPENROUTER = 'openrouter.ai/api/v1/models (pricing.prompt / pricing.completion), read 2026-10-18';

export const PRICES: readonly PriceRow[] = [
  // Anthropic, first-party API, global routing (no inference_geo multiplier).
  // claude-fable-5-1: $10 / $50, cache hits $0.25 (0.025x), 5m cache writes $12.50. Source: ANTHROPIC.
  { provider: 'anthropic', model: 'claude-fable-5-1', inputPerMTok: 10, outputPerMTok: 50, cacheReadPerMTok: 0.25, cacheWritePerMTok: 12.5, source: ANTHROPIC },
  // claude-opus-5-5: $4 / $20, cache hits $0.20 (0.05x), 5m cache writes $5. Source: ANTHROPIC.
  { provider: 'anthropic', model: 'claude-opus-5-5', inputPerMTok: 4, outputPerMTok: 20, cacheReadPerMTok: 0.2, cacheWritePerMTok: 5, source: ANTHROPIC },
  // claude-sonnet-5-5: $2 / $10, cache hits $0.10 (0.05x), 5m cache writes $2.50. Source: ANTHROPIC. On 2026-10-07 the
  // table listed cache hits at $0.20 while its prose said $0.10, and byway recorded the higher figure. On 2026-10-18 the
  // table, its footnote ("0.05x the base input price") and the prose all say $0.10.
  { provider: 'anthropic', model: 'claude-sonnet-5-5', inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.1, cacheWritePerMTok: 2.5, source: ANTHROPIC },
  // Older Opus models no profile names: claude-opus-5 and claude-opus-4-8, $5 / $25, cache hits $0.50, 5m cache writes
  // $6.25. Source: ANTHROPIC.
  // byway asks no provider for a fallback model (ADR-0102), so neither should answer a call. If one ever does, it is
  // priced at its own row, and the ledger shows the model that answered; any other unpriced model settles at the
  // requested model's row, flagged 'assumed' (servedPrice).
  { provider: 'anthropic', model: 'claude-opus-5', inputPerMTok: 5, outputPerMTok: 25, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25, source: ANTHROPIC },
  { provider: 'anthropic', model: 'claude-opus-4-8', inputPerMTok: 5, outputPerMTok: 25, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25, source: ANTHROPIC },

  // OpenAI, Standard processing, short context (up to 272K input tokens; byway's prompts stay well under).
  // Cache writes: OpenAI's prompt-caching guide (developers.openai.com/api/docs/guides/prompt-caching, read 2026-10-21)
  // says caching "is enabled by default for supported OpenAI models", and that for GPT-5.6 and later "cache writes cost
  // 1.25× the standard, uncached input-token rate" for the default 30-minute lifetime. byway sends no
  // prompt_cache_options, so OpenAI places its implicit breakpoint (the SDK's default) and writes a prompt of 1,024
  // tokens or more that it has not cached. The page lists the rate as "Short context 30m write". Writes are "not an
  // additive fee": each input token is billed at one of the uncached, cached or write rates, as tokenCost charges them.
  // Chat Completions offers only the 30-minute lifetime (the SDK: the ttl "defaults to `30m`, which is currently the
  // only supported value"), so the page's 12-hour write rate (2.5×, the Responses API) does not apply. Until 2026-10-21
  // these rows had no write rate, so a written token was charged at the input rate, a fifth below its cost.
  // gpt-6-astra: $10 / $50, cached input $1, 30-minute cache writes $12.50. Source: OPENAI.
  { provider: 'openai', model: 'gpt-6-astra', inputPerMTok: 10, outputPerMTok: 50, cacheReadPerMTok: 1, cacheWritePerMTok: 12.5, source: OPENAI },
  // gpt-6.1-sol: $2 / $10, cached input $0.10, 30-minute cache writes $2.50. Source: OPENAI.
  { provider: 'openai', model: 'gpt-6.1-sol', inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.1, cacheWritePerMTok: 2.5, source: OPENAI },
  // gpt-6-luna: $0.10 / $0.50, 30-minute cache writes $0.125. Source: OPENAI. Its cached input ($0.01) is not recorded,
  // so a cached token would be charged at the input rate, which leans high; no profile uses this model.
  { provider: 'openai', model: 'gpt-6-luna', inputPerMTok: 0.1, outputPerMTok: 0.5, cacheWritePerMTok: 0.125, source: OPENAI },
  // gpt-image-2.5-flare and gpt-image-2.5-sunburst: text input $5, image output $30 per 1M tokens. Source: OPENAI.
  // byway sends them a text prompt only, so their image input price ($8) does not apply. Their cached text input ($1.25)
  // is not recorded: the page says cached input rates for these models "only apply to images generated with the
  // Responses API", and byway uses the Images API. The page lists no cache-write rate for them. OpenAI publishes no
  // per-image figure for these models (it points to a calculator), so 8,000 output tokens per image (~$0.24) is our
  // planning bound for the pre-call estimate only; the ledger uses the usage the API returns.
  { provider: 'openai', model: 'gpt-image-2.5-flare', inputPerMTok: 5, outputPerMTok: 30, estimatedOutputTokensPerImage: 8000, source: OPENAI },
  { provider: 'openai', model: 'gpt-image-2.5-sunburst', inputPerMTok: 5, outputPerMTok: 30, estimatedOutputTokensPerImage: 8000, source: OPENAI },

  // Google Gemini API, paid tier, Standard, prompts <= 200k tokens (the product's prompts stay well under).
  // Context caching is not recorded. The page lists a cache rate for both text models below (gemini-3.1-pro-preview
  // $0.20; gemini-3.8-flash $0.075 through 2026-12-31, then $0.15), and Google's caching guide
  // (ai.google.dev/gemini-api/docs/caching, read 2026-10-21) says implicit caching "is enabled by default for all Gemini
  // 2.5 and newer models". google.ts reports a hit (cachedContentTokenCount) as cache reads, which these rows charge at the
  // input rate, so the cost leans high. byway makes no explicit caches, so the storage price does not apply.
  // gemini-3.1-pro-preview: $2 / $12, output including thinking (> 200k: $4 / $18). Source: GOOGLE.
  { provider: 'google', model: 'gemini-3.1-pro-preview', inputPerMTok: 2, outputPerMTok: 12, source: GOOGLE },
  // gemini-3.8-flash: $0.75 / $3.75 through 2026-12-31, then $1.50 / $7.50 from 2027-01-01, output including thinking.
  // Source: GOOGLE.
  { provider: 'google', model: 'gemini-3.8-flash', inputPerMTok: 0.75, outputPerMTok: 3.75, source: GOOGLE },
  { provider: 'google', model: 'gemini-3.8-flash', from: '2027-01-01', inputPerMTok: 1.5, outputPerMTok: 7.5, source: GOOGLE },
  // gemini-nano-banana-2.1: input $1.50 per 1M tokens. Output is priced two ways: "text and thinking" at $7.50 per 1M
  // tokens, and images at $30 per 1M tokens, which Google gives as $0.0336 for a 1K image (1,120 tokens), the size the
  // gateway asks for. So the image is charged per image, and the answer's text and thinking tokens on top
  // (providers/google.ts). Source: GOOGLE. Until 2026-10-18 byway charged only the image and the input (backlog "Gemini
  // image thinking tokens"). Google's image guide (ai.google.dev/gemini-api/docs/image-generation, read 2026-10-18)
  // says thinking is on for its Gemini 3 image models and cannot be turned off (this model's default level is medium),
  // and that thinking tokens are billed. Neither page gives a count of thinking tokens per image, so the 2,000 planned
  // here (about $0.015 an image) is Claude's planning number, not Google's figure; the first live run's ledger will show
  // the real counts.
  { provider: 'google', model: 'gemini-nano-banana-2.1', inputPerMTok: 1.5, outputPerMTok: 7.5, perImageUsd: 0.0336, estimatedOutputTokensPerImage: 2000, source: GOOGLE },

  // OpenRouter, pinned to the first-party provider (same list price as the provider's own API).
  // anthropic/claude-fable-5.1: $10 / $50. Source: OPENROUTER.
  { provider: 'openrouter', model: 'anthropic/claude-fable-5.1', inputPerMTok: 10, outputPerMTok: 50, source: OPENROUTER },
  // anthropic/claude-opus-5.5: $4 / $20. Source: OPENROUTER.
  { provider: 'openrouter', model: 'anthropic/claude-opus-5.5', inputPerMTok: 4, outputPerMTok: 20, source: OPENROUTER },
  // anthropic/claude-sonnet-5.5: $2 / $10. Source: OPENROUTER.
  // OpenRouter also lists cache rates for these three (openrouter.ai/api/v1/models, read 2026-10-21: reads at 0.05× input,
  // 0.025× for Fable; 5-minute writes at 1.25×; 1-hour writes at 2×). They are not recorded. Anthropic caches only when a
  // request carries cache_control, which byway never sends, so none of them applies; and OpenRouter reports each call's
  // cost (usage.cost), which the gateway records instead of pricing the tokens. Were that cost missing, a cache read
  // would be charged at the input rate (high) and a cache write at the input rate too (low).
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
    source: 'fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video, read 2026-10-18',
  },
  // kling-video/v3/pro/image-to-video: "$0.112 (audio off)" per second of video ($0.168 with audio, $0.196 with voice
  // control). The gateway always sends generate_audio: false.
  {
    provider: 'fal',
    model: 'fal-ai/kling-video/v3/pro/image-to-video',
    inputPerMTok: 0,
    outputPerMTok: 0,
    perSecondUsd: 0.112,
    source: 'fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video, read 2026-10-18',
  },
  // ffmpeg-api/extract-frame (the relay anchor: a clip's last frame): "Your request will cost $0.0002 per second" of
  // compute. fal does not report the seconds to the client; the gateway charges a fixed upper bound (providers/fal.ts).
  { provider: 'fal', model: 'fal-ai/ffmpeg-api/extract-frame', inputPerMTok: 0, outputPerMTok: 0, perSecondUsd: 0.0002, source: 'fal.ai/models/fal-ai/ffmpeg-api/extract-frame, read 2026-10-18' },

  // The demo-mode mock costs nothing.
  { provider: 'mock', model: 'mock-big', inputPerMTok: 0, outputPerMTok: 0, source: 'byway mock provider, 2026-10-07' },
  { provider: 'mock', model: 'mock-mid', inputPerMTok: 0, outputPerMTok: 0, source: 'byway mock provider, 2026-10-07' },
  { provider: 'mock', model: 'mock-other', inputPerMTok: 0, outputPerMTok: 0, source: 'byway mock provider, 2026-10-07' },
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

/**
 * A dated or versioned snapshot suffix as providers report served models: `-YYYY-MM-DD` and `-YYYYMMDD` (OpenAI,
 * Anthropic), a three-digit `-NNN` (Gemini versions) or `@<version>`. The forms are this narrow on purpose: Anthropic
 * warns that `claude-opus-5-5` starts with `claude-opus-5`, and no rule here can read one as a snapshot of the other.
 */
const SNAPSHOT_SUFFIX = /(?:-\d{4}-\d{2}-\d{2}|-\d{8}|-\d{3}|@[A-Za-z0-9._-]+)$/;

/**
 * Google's dated preview snapshots: `-preview-MM-DD` (gemini-2.5-pro-preview-06-05) and `-preview-MM-YYYY`
 * (gemini-2.5-flash-preview-09-2025). Only the date is dropped and `-preview` stays, so a dated preview is read only as
 * a snapshot of a priced preview id, never of the model's stable id. Read for Google alone, and only a real month with a
 * real day or a four-digit year starting 20.
 */
const GOOGLE_DATED_PREVIEW = /^(.+-preview)-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]|20\d{2})$/;

/** The id a served model is a dated or versioned snapshot of, or undefined when it has no snapshot form. */
function snapshotBase(provider: ProviderId, servedModel: string): string | undefined {
  const base = servedModel.replace(SNAPSHOT_SUFFIX, '');
  if (base !== servedModel) return base;
  return provider === 'google' ? GOOGLE_DATED_PREVIEW.exec(servedModel)?.[1] : undefined;
}

/**
 * The row a served model is settled at (F04, ADR-0091): its own row first, so a known model is never priced above or
 * below its own rates; then, for a dated or versioned snapshot of a priced model, that model's row; otherwise the
 * requested model's row, flagged `assumed`, which the ledger records (LedgerEntry.priceBasis) and Settings shows.
 */
export function servedPrice(table: readonly PriceRow[], provider: ProviderId, servedModel: string, requested: PriceRow, at: Date): { row: PriceRow; assumed: boolean } {
  // Adapters copy the reported label unchecked (ADR-0083): one that is not a string names no row.
  if (typeof servedModel !== 'string') return { row: requested, assumed: true };
  const own = priceFor(table, provider, servedModel, at);
  if (own) return { row: own, assumed: false };
  const base = snapshotBase(provider, servedModel);
  const snapshotOf = base !== undefined ? priceFor(table, provider, base, at) : undefined;
  if (snapshotOf) return { row: snapshotOf, assumed: false };
  return { row: requested, assumed: true };
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
