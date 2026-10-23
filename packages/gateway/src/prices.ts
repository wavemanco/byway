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
  /**
   * The model's long-context tier, where its provider prices a long prompt higher (LC-TIERS, block 2): OpenAI's
   * GPT-6 text models above 272K input tokens and Gemini 3.1 Pro above 200k. A call whose prompt is longer than the
   * threshold is charged the tier's rates on every token, its output and cache tokens too (tokenCost). Omitted for a
   * model priced the same at every length.
   */
  longContext?: LongContextTier;
  /** Where the number was read, and when. */
  source: string;
}

/**
 * The rates of a long-context tier, in the row's units. A cache rate the tier does not list is charged at the tier's
 * input rate, as a row's is at the row's (so a rate left out leans high or low as the row's comment says), never at a
 * short-context rate.
 */
export interface LongContextTier {
  /**
   * The tier applies when the call's prompt has more input tokens than this: OpenAI's page reads "Long: >272K input
   * tokens", Google's "prompts > 200k tokens". The prompt is counted whole, cached tokens included (Usage.inputTokens),
   * which is Claude's reading: neither page says how the threshold is counted, and Anthropic's, for the one Claude model
   * it prices by prompt length (Claude Haiku 5.5, which no profile uses), says "A request's prompt length counts all of
   * its input tokens, including cache reads and cache writes". "272K" and "200k" are read as 272,000 and 200,000 tokens.
   */
  aboveInputTokens: number;
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok?: number;
  cacheWritePerMTok?: number;
}

// Every row below was read again on 2026-10-18, before the first live run. Each figure matched its page then, except two
// that byway changed: claude-sonnet-5-5's cache hits, and gemini-nano-banana-2.1's text and thinking output, which
// byway did not charge before. The OpenAI rows lacked a rate their page lists, the cache writes OpenAI charges by
// default; it was added when the page was read again on 2026-10-21. Google's page was read again that day too, and
// every figure byway records from it was unchanged. Anthropic's page and OpenRouter's model list were read that day
// only for the rates these rows do not record (ADR-0109 decision 1).
//
// Every row was read again on 2026-10-22, the full re-read the owner's cadence asks for (PRICE-CADENCE, block 2: the
// owner's answer of 2026-10-21 23:15, "Weekly report + monthly re-read + date in the app (Recommended)"), and every
// figure the rows recorded matched its page; the long-context tiers were added that day (LC-TIERS). The guides the
// comments quote were read again that day too (OpenAI's prompt-caching guide, Google's caching and image-generation
// guides), and each still says what is quoted. PRICES_CHECKED is that day. The dates here are the day of the session
// that read the pages, as the records date the owner's answers: this read ran from 17:00 to 17:20 Pacific time on
// 2026-10-22, which was 00:00 to 00:20 UTC on 2026-10-23.
const ANTHROPIC = 'platform.claude.com/docs/en/about-claude/pricing, read 2026-10-18 and again 2026-10-22';
const OPENAI = 'developers.openai.com/api/docs/pricing, read 2026-10-18, 2026-10-21 and 2026-10-22';
const GOOGLE = 'ai.google.dev/gemini-api/docs/pricing (page dated 2026-10-16), read 2026-10-18, 2026-10-21 (page dated 2026-10-19) and 2026-10-22 (page dated 2026-10-22)';
const OPENROUTER = 'openrouter.ai/api/v1/models (pricing.prompt / pricing.completion), read 2026-10-18 and again 2026-10-22';

/**
 * The day byway's prices were last checked: the last day every row a provider charges for was read against its page
 * (YYYY-MM-DD, the session's day, as the sources give it). Settings and the Recommendation's estimated cost show it,
 * with a notice once it is more than about 45 days old, as the owner chose on 2026-10-21 ("Settings and the estimate
 * show when prices were last checked, with a notice after about 45 days"); they count whole UTC days from its start, so
 * its age can read a day off the session's clock. Moved only by a full re-read: a page read alone, after the weekly
 * report flags it, changes that page's rows and their sources, not this day (pricing.test.ts holds every paid row's
 * source to it).
 */
export const PRICES_CHECKED = '2026-10-22';

export const PRICES: readonly PriceRow[] = [
  // Anthropic, first-party API, global routing (no inference_geo multiplier). No row has a long-context tier: the page's
  // "Long context pricing" says "Claude 4.6 and later models (except Claude Haiku 5.5) and Claude Mythos Preview include
  // the full 1M token context window at standard pricing. (A 900k-token request is billed at the same per-token rate as
  // a 9k-token request.)", which covers every model below (read 2026-10-22). Claude Haiku 5.5, priced higher for prompts
  // over 100,000 tokens, has no row: no profile uses it. OpenRouter's rows for Claude follow (below).
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

  // OpenAI, Standard processing. The page has two context lengths, "Short: ≤272K input tokens" and "Long: >272K input
  // tokens", for these three text models; each row is its short rates, with its long ones in `longContext`, so a call
  // whose prompt is longer than 272,000 tokens is charged the long rates on all its tokens (tokenCost; LC-TIERS, block
  // 2). byway's prompts are mostly well under, but a maximal brief can pass it: Start accepts about 1,020,000 characters
  // of brief and attachments, roughly 255,000 tokens of English, which the estimate (estimate.ts) counts at about
  // 340,000, and a step's prompt carries more than the brief. The long rates were read on 2026-10-22: the page draws its
  // Long table from its own script (developers.openai.com/_astro/pricing.*.js, whose Standard entry reads
  // "gpt-6-astra":{input:20,output:75,cachedInput:2,cacheWrite:25}), and it says nothing of how the 272K are counted.
  // Its 12-hour write rates do not apply at either length (below).
  // Cache writes: OpenAI's prompt-caching guide (developers.openai.com/api/docs/guides/prompt-caching, read 2026-10-21)
  // says caching "is enabled by default for supported OpenAI models", and that for GPT-5.6 and later "cache writes cost
  // 1.25× the standard, uncached input-token rate" for the default 30-minute lifetime. byway sends no
  // prompt_cache_options, so OpenAI places its implicit breakpoint (the SDK's default) and writes a prompt of 1,024
  // tokens or more that it has not cached. The page lists the rate as "Short context 30m write". Writes are "not an
  // additive fee": each input token is billed at one of the uncached, cached or write rates, as tokenCost charges them.
  // Chat Completions offers only the 30-minute lifetime (the SDK: the ttl "defaults to `30m`, which is currently the
  // only supported value"), so the page's 12-hour write rate (2.5×, the Responses API) does not apply. Until 2026-10-21
  // these rows had no write rate, so a written token was charged at the input rate, a fifth below its cost.
  // gpt-6-astra: $10 / $50, cached input $1, 30-minute cache writes $12.50; long context $20 / $75, cached input $2,
  // 30-minute cache writes $25. Source: OPENAI.
  {
    provider: 'openai',
    model: 'gpt-6-astra',
    inputPerMTok: 10,
    outputPerMTok: 50,
    cacheReadPerMTok: 1,
    cacheWritePerMTok: 12.5,
    longContext: { aboveInputTokens: 272_000, inputPerMTok: 20, outputPerMTok: 75, cacheReadPerMTok: 2, cacheWritePerMTok: 25 },
    source: OPENAI,
  },
  // gpt-6.1-sol: $2 / $10, cached input $0.10, 30-minute cache writes $2.50; long context $4 / $15, cached input $0.20,
  // 30-minute cache writes $5. Source: OPENAI.
  {
    provider: 'openai',
    model: 'gpt-6.1-sol',
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheReadPerMTok: 0.1,
    cacheWritePerMTok: 2.5,
    longContext: { aboveInputTokens: 272_000, inputPerMTok: 4, outputPerMTok: 15, cacheReadPerMTok: 0.2, cacheWritePerMTok: 5 },
    source: OPENAI,
  },
  // gpt-6-luna: $0.10 / $0.50, 30-minute cache writes $0.125; long context $0.20 / $0.75, 30-minute cache writes $0.25.
  // Source: OPENAI. Its cached input ($0.01, long context $0.02) is not recorded, so a cached token would be charged at
  // the input rate of its tier, which leans high; no profile uses this model.
  {
    provider: 'openai',
    model: 'gpt-6-luna',
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    cacheWritePerMTok: 0.125,
    longContext: { aboveInputTokens: 272_000, inputPerMTok: 0.2, outputPerMTok: 0.75, cacheWritePerMTok: 0.25 },
    source: OPENAI,
  },
  // gpt-image-2.5-flare and gpt-image-2.5-sunburst: text input $5, image output $30 per 1M tokens. Source: OPENAI. The
  // page gives them one context length.
  // byway sends them a text prompt only, so their image input price ($8) does not apply. Their cached text input ($1.25)
  // is not recorded: the page says cached input rates for these models "only apply to images generated with the
  // Responses API", and byway uses the Images API. The page lists no cache-write rate for them. OpenAI publishes no
  // per-image figure for these models (it points to a calculator), so 8,000 output tokens per image (~$0.24) is our
  // planning bound for the pre-call estimate only; the ledger uses the usage the API returns. The calculator, in OpenAI's
  // image-generation guide (developers.openai.com/api/docs/guides/image-generation, read 2026-10-22), gives 439 output
  // tokens for GPT Image 2.5 at medium quality and 1024x1024 and 343 at 1536x1024 or 1024x1536 (about $0.013 and $0.010);
  // Pixmax, a second party, reports about 367 at medium and 2048x1152 (the answer-waits research of 2026-10-22). The
  // 8,000 is left as it is, so the estimate leans high, until the first live run's ledger shows the real counts (Claude's
  // choice: lowering it lowers every image reservation, which is the money path's to decide).
  { provider: 'openai', model: 'gpt-image-2.5-flare', inputPerMTok: 5, outputPerMTok: 30, estimatedOutputTokensPerImage: 8000, source: OPENAI },
  { provider: 'openai', model: 'gpt-image-2.5-sunburst', inputPerMTok: 5, outputPerMTok: 30, estimatedOutputTokensPerImage: 8000, source: OPENAI },

  // Google Gemini API, paid tier, Standard. gemini-3.1-pro-preview is priced by prompt length, "prompts <= 200k tokens"
  // and "prompts > 200k tokens" (input; its output rates read "prompts <= 200k" and "prompts > 200k"): its row is the
  // first, with the second in `longContext`, so a call whose prompt is longer than 200,000 tokens is charged the long
  // rates on all its tokens (tokenCost; LC-TIERS, block 2), which a maximal brief can reach (see the OpenAI rows). The
  // page lists one rate at every length for gemini-3.8-flash and gemini-nano-banana-2.1. Read 2026-10-22, the page
  // "Last updated 2026-10-22 UTC".
  // Context caching is not recorded. The page lists a cache rate for both text models below (gemini-3.1-pro-preview
  // $0.20; gemini-3.8-flash $0.075 through 2026-12-31, then $0.15), and Google's caching guide
  // (ai.google.dev/gemini-api/docs/caching, read 2026-10-21) says implicit caching "is enabled by default for all Gemini
  // 2.5 and newer models". google.ts reports a hit (cachedContentTokenCount) as cache reads, which these rows charge at the
  // input rate, so the cost leans high. byway makes no explicit caches, so the storage price does not apply. Above
  // 200k the page's cache rate is $0.40, likewise not recorded: a hit there is charged at the long input rate.
  // gemini-3.1-pro-preview: $2 / $12, output including thinking; prompts > 200k tokens $4 / $18. Source: GOOGLE.
  {
    provider: 'google',
    model: 'gemini-3.1-pro-preview',
    inputPerMTok: 2,
    outputPerMTok: 12,
    longContext: { aboveInputTokens: 200_000, inputPerMTok: 4, outputPerMTok: 18 },
    source: GOOGLE,
  },
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

  // OpenRouter, pinned to the first-party provider (same list price as the provider's own API). Its model list gives
  // these one prompt and one completion price at every length, as Anthropic does (read 2026-10-22).
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
    source: 'fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video, read 2026-10-18 and again 2026-10-22',
  },
  // kling-video/v3/pro/image-to-video: "$0.112 (audio off)" per second of video ($0.168 with audio, $0.196 with voice
  // control). The gateway always sends generate_audio: false.
  {
    provider: 'fal',
    model: 'fal-ai/kling-video/v3/pro/image-to-video',
    inputPerMTok: 0,
    outputPerMTok: 0,
    perSecondUsd: 0.112,
    source: 'fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video, read 2026-10-18 and again 2026-10-22',
  },
  // ffmpeg-api/extract-frame (the relay anchor: a clip's last frame): "Your request will cost $0.0002 per second" of
  // compute. fal does not report the seconds to the client; the gateway charges a fixed upper bound (providers/fal.ts).
  { provider: 'fal', model: 'fal-ai/ffmpeg-api/extract-frame', inputPerMTok: 0, outputPerMTok: 0, perSecondUsd: 0.0002, source: 'fal.ai/models/fal-ai/ffmpeg-api/extract-frame, read 2026-10-18 and again 2026-10-22' },

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

/**
 * The rates a call's tokens are charged at: the row's long-context tier when the call's prompt (all its input tokens,
 * cached ones included) is longer than the tier's threshold, else the row's own rates (LC-TIERS, block 2).
 */
function ratesFor(price: PriceRow, inputTokens: number): Pick<PriceRow, 'inputPerMTok' | 'outputPerMTok' | 'cacheReadPerMTok' | 'cacheWritePerMTok'> {
  const tier = price.longContext;
  return tier !== undefined && inputTokens > tier.aboveInputTokens ? tier : price;
}

/**
 * USD cost of a completion's tokens, at the tier its prompt falls in (ratesFor). Cache tokens are priced separately when
 * the tier lists their rates. This prices the gateway's reservation (the planning estimate), its settlement (the usage
 * the provider reports) and the advisor's estimates alike, so each is charged at the call's own tier.
 */
export function tokenCost(price: PriceRow, usage: TokenBreakdown): number {
  const rates = ratesFor(price, usage.inputTokens);
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const plainInput = Math.max(0, usage.inputTokens - cacheRead - cacheWrite);
  const usd =
    plainInput * rates.inputPerMTok +
    cacheRead * (rates.cacheReadPerMTok ?? rates.inputPerMTok) +
    cacheWrite * (rates.cacheWritePerMTok ?? rates.inputPerMTok) +
    usage.outputTokens * rates.outputPerMTok;
  return roundUsd(usd / 1_000_000);
}

/** Round to a millionth of a dollar: enough precision for single calls, and stable in the hash-chained ledger. */
export function roundUsd(usd: number): number {
  return Math.round(usd * 1_000_000) / 1_000_000;
}
