import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompletionRequest, GatewayError } from '@byway/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGateway, type GatewayOptions } from '../src/gateway.ts';
import { maxCompletionCost, maxImageCost } from '../src/estimate.ts';
import { PRICES, priceFor, servedPrice, tokenCost, type PriceRow } from '../src/prices.ts';
import { anthropicMessage, fakeAnthropic, fakeGoogle, fakeOpenAI, MemoryArtifacts } from './fakes.ts';
import { memorySpendBook } from '../src/memory-book.ts';

/**
 * F04: settlement prices what the provider says served the call (ADR-0091). The served model's own row first; then a
 * dated or versioned snapshot of a priced model at that model's row; anything else at the requested model's row,
 * flagged priceBasis 'assumed' in the ledger, so a guess is never silent.
 */

const AT = new Date('2026-10-07T12:00:00Z');
const row = (provider: Parameters<typeof priceFor>[1], model: string) => {
  const r = priceFor(PRICES, provider, model, AT);
  if (!r) throw new Error(`no row for ${model}`);
  return r;
};

describe('servedPrice', () => {
  it.each([
    ['openai', 'gpt-6.1-sol', 'gpt-6.1-sol-2026-09-30', 'gpt-6.1-sol'],
    ['openai', 'gpt-6.1-sol', 'gpt-6.1-sol-20260930', 'gpt-6.1-sol'],
    ['google', 'gemini-3.8-flash', 'gemini-3.8-flash-001', 'gemini-3.8-flash'],
    ['google', 'gemini-3.8-flash', 'gemini-3.8-flash@001', 'gemini-3.8-flash'],
    ['anthropic', 'claude-opus-5-5', 'claude-opus-5-5', 'claude-opus-5-5'],
    // A known model is priced at its own row, never read as a snapshot of a shorter id (Anthropic's prefix warning).
    ['anthropic', 'claude-opus-5', 'claude-opus-5-5', 'claude-opus-5-5'],
    // A dated snapshot of another priced model is priced at that model's row, not the requested one's.
    ['anthropic', 'claude-opus-5-5', 'claude-opus-4-8-20261001', 'claude-opus-4-8'],
    // Google's dated previews (gemini-2.5-pro-preview-06-05, gemini-2.5-flash-preview-09-2025): the date goes, -preview stays.
    ['google', 'gemini-3.1-pro-preview', 'gemini-3.1-pro-preview-10-01', 'gemini-3.1-pro-preview'],
    ['google', 'gemini-3.1-pro-preview', 'gemini-3.1-pro-preview-09-2026', 'gemini-3.1-pro-preview'],
    ['google', 'gemini-3.8-flash', 'gemini-3.1-pro-preview-12-31', 'gemini-3.1-pro-preview'],
  ] as const)('%s: %s served as %s is priced at %s, unflagged', (provider, requested, served, expected) => {
    expect(servedPrice(PRICES, provider, served, row(provider, requested), AT)).toEqual({ row: row(provider, expected), assumed: false });
  });

  it.each([['claude-unpriced-x'], ['claude-opus-5-5-preview'], ['claude-opus-5-55'], ['gpt-6.1-sol-2026-09']])('prices %s, which has no row, at the requested row, flagged assumed', (served) => {
    const requested = row('anthropic', 'claude-opus-5-5');
    expect(servedPrice(PRICES, 'anthropic', served, requested, AT)).toEqual({ row: requested, assumed: true });
  });

  it.each([
    // Not a month and day, or a month and year.
    ['gemini-3.1-pro-preview-13-01'],
    ['gemini-3.1-pro-preview-10-32'],
    ['gemini-3.1-pro-preview-10-1'],
    ['gemini-3.1-pro-preview-10-202'],
    // Not after -preview: a dated form of a model that is not a preview, or a preview with no priced row.
    ['gemini-3.8-flash-10-01'],
    ['gemini-3.8-flash-preview-10-01'],
  ])('google: prices %s, which is no dated preview of a priced model, at the requested row, flagged assumed', (served) => {
    const requested = row('google', 'gemini-3.8-flash');
    expect(servedPrice(PRICES, 'google', served, requested, AT)).toEqual({ row: requested, assumed: true });
  });

  it('reads the dated preview form only for Google', () => {
    const requested = row('anthropic', 'claude-opus-5-5');
    const table = [...PRICES, { ...requested, model: 'claude-opus-5-5-preview' }];
    expect(servedPrice(table, 'anthropic', 'claude-opus-5-5-preview-10-01', requested, AT)).toEqual({ row: requested, assumed: true });
  });

  it('never reads a priced id as a snapshot of another priced id, and a dated preview only as its own preview', () => {
    for (const r of PRICES) {
      const other = PRICES.find((o) => o.provider === r.provider && o.model !== r.model) ?? r;
      expect(servedPrice(PRICES, r.provider, r.model, other, AT).row.model, `${r.provider}/${r.model}`).toBe(r.model);
      const dated = servedPrice(PRICES, r.provider, `${r.model}-10-01`, other, AT);
      if (!dated.assumed) expect(dated.row.model, `${r.provider}/${r.model}-10-01`).toBe(r.model);
    }
  });
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'byway-price-'));
});

const KEYS = { ANTHROPIC_API_KEY: 'sk-ant-api03-test-not-a-real-key-000000', OPENAI_API_KEY: 'sk-test-not-a-real-openai-key-0000000', GEMINI_API_KEY: 'AIza-test-not-real-0000000000000' };

function gateway(over: Partial<GatewayOptions> = {}) {
  return createGateway({
    ledgerPath: join(dir, 'ledger.jsonl'),
    spendBook: memorySpendBook(),
    artifacts: new MemoryArtifacts(),
    caps: { workspaceCapUsd: () => 100 },
    env: KEYS,
    retry: { sleep: async () => {}, random: () => 0.5 },
    now: () => AT,
    ...over,
  });
}

const req = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  workspaceId: 'ws-1',
  runId: 'run-1',
  purpose: 'critic:web-page',
  profileId: 'balanced',
  tier: 'big',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Judge this page.' }] }],
  maxOutputTokens: 1000,
  ...over,
});

const ledgerLines = () => readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);

/**
 * An answer that lists two billed attempts, the second by `model`: the shape Anthropic's server-side fallback reported.
 * byway no longer asks for one (ADR-0102), but settlement still prices any model an answer names at its own row.
 */
const fallback = (model: string) =>
  anthropicMessage({
    model,
    usage: {
      input_tokens: 1000,
      output_tokens: 1000,
      iterations: [
        { type: 'message', model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 0 },
        { type: 'fallback_message', model, input_tokens: 1000, output_tokens: 1000 },
      ],
    },
  });

describe('gateway: settlement by the served model (F04)', () => {
  it('flags a call served by a model with no price: priced at the requested row, priceBasis assumed, in the hash chain and the spend summary', async () => {
    const g = gateway({ clients: { anthropic: fakeAnthropic([fallback('claude-unpriced-x')]).client } });
    const res = await g.complete(req());
    // Opus 5.5 rates for both attempts: 1000 in at $4/M, then 1000 in and 1000 out at $4/$20 per M.
    expect(res.costUsd).toBeCloseTo(0.004 + 0.004 + 0.02, 9);
    expect(ledgerLines()[0]).toMatchObject({ servedModel: 'claude-unpriced-x', priceBasis: 'assumed' });
    expect(await g.verifyLedger()).toBeNull();
    expect((await g.spend('ws-1')).assumedPricing).toEqual({ calls: 1, usd: res.costUsd });
  });

  it("prices a dated snapshot of a known model at that model's own row, unflagged", async () => {
    const g = gateway({ clients: { anthropic: fakeAnthropic([fallback('claude-opus-4-8-20261001')]).client } });
    const res = await g.complete(req());
    // Opus 5.5: 1000 in at $4/M. Opus 4.8: 1000 in at $5/M and 1000 out at $25/M.
    expect(res.costUsd).toBeCloseTo(0.004 + 0.005 + 0.025, 9);
    expect(ledgerLines()[0]).not.toHaveProperty('priceBasis');
    expect((await g.spend('ws-1')).assumedPricing).toBeUndefined();
  });

  it('prices OpenAI and Google snapshots of the requested model at its row, unflagged', async () => {
    const openai = fakeOpenAI([{ model: 'gpt-6.1-sol-2026-09-30', choices: [{ finish_reason: 'stop', message: { content: 'ok' } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } }]);
    const google = fakeGoogle([{ modelVersion: 'gemini-3.8-flash-001', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ok' }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100 } }]);
    const g = gateway({ clients: { openai: openai.client, google: google.client } });
    const a = await g.complete(req({ profileId: 'openai', tier: 'mid' }));
    const b = await g.complete(req({ profileId: 'google', tier: 'mid' }));
    // gpt-6.1-sol $2/$10; gemini-3.8-flash $0.75/$3.75 (introductory, through 2026-12-31).
    expect(a.costUsd).toBeCloseTo(0.002 + 0.001, 9);
    expect(b.costUsd).toBeCloseTo(0.00075 + 0.000375, 9);
    expect(ledgerLines().map((e) => e.priceBasis)).toEqual([undefined, undefined]);
  });

  it('flags an image whose served model has no price', async () => {
    const google = fakeGoogle([
      {
        modelVersion: 'gemini-image-preview-x',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { data: Buffer.from('jpeg-bytes').toString('base64'), mimeType: 'image/jpeg' } }] } }],
        usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 1290, candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1290 }] },
      },
    ]);
    const g = gateway({ clients: { google: google.client } });
    const res = await g.image({ workspaceId: 'ws-1', purpose: 'asset:web-page', profileId: 'balanced', prompt: 'A loaf', size: '1024x1024' });
    expect(res.costUsd).toBeCloseTo(0.0336 + 30 * 1.5e-6, 9);
    expect(ledgerLines()[0]).toMatchObject({ kind: 'image', priceBasis: 'assumed' });
  });
});

/**
 * B1, before the first live run: every price row read again on 2026-10-18 against the provider's own page (the source
 * each row names). Two figures changed: claude-sonnet-5-5's cache hits ($0.10: the table, its footnote and the prose
 * now agree) and gemini-nano-banana-2.1's text and thinking output ($7.50 per 1M tokens, which byway did not charge).
 * The OpenAI rows' 30-minute cache-write rates ("Short context 30m write", 1.25× input) were added from the page as read
 * on 2026-10-21; the rows had left them out (MONEY-1).
 */
describe('the price rows, as the providers documented them on 2026-10-18', () => {
  const ON = new Date('2026-10-18T12:00:00Z');
  const figures = (provider: Parameters<typeof priceFor>[1], model: string) => {
    const { inputPerMTok, outputPerMTok, cacheReadPerMTok, cacheWritePerMTok, perImageUsd, perSecondUsd } = priceFor(PRICES, provider, model, ON)!;
    return { inputPerMTok, outputPerMTok, cacheReadPerMTok, cacheWritePerMTok, perImageUsd, perSecondUsd };
  };
  const tokens = (inputPerMTok: number, outputPerMTok: number, cache: { cacheReadPerMTok?: number; cacheWritePerMTok?: number } = {}) => ({
    inputPerMTok,
    outputPerMTok,
    cacheReadPerMTok: cache.cacheReadPerMTok,
    cacheWritePerMTok: cache.cacheWritePerMTok,
    perImageUsd: undefined,
    perSecondUsd: undefined,
  });

  it.each([
    ['anthropic', 'claude-fable-5-1', tokens(10, 50, { cacheReadPerMTok: 0.25, cacheWritePerMTok: 12.5 })],
    ['anthropic', 'claude-opus-5-5', tokens(4, 20, { cacheReadPerMTok: 0.2, cacheWritePerMTok: 5 })],
    ['anthropic', 'claude-sonnet-5-5', tokens(2, 10, { cacheReadPerMTok: 0.1, cacheWritePerMTok: 2.5 })],
    ['anthropic', 'claude-opus-5', tokens(5, 25, { cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25 })],
    ['anthropic', 'claude-opus-4-8', tokens(5, 25, { cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25 })],
    ['openai', 'gpt-6-astra', tokens(10, 50, { cacheReadPerMTok: 1, cacheWritePerMTok: 12.5 })],
    ['openai', 'gpt-6.1-sol', tokens(2, 10, { cacheReadPerMTok: 0.1, cacheWritePerMTok: 2.5 })],
    ['openai', 'gpt-6-luna', tokens(0.1, 0.5, { cacheWritePerMTok: 0.125 })],
    ['openai', 'gpt-image-2.5-flare', tokens(5, 30)],
    ['openai', 'gpt-image-2.5-sunburst', tokens(5, 30)],
    ['google', 'gemini-3.1-pro-preview', tokens(2, 12)],
    ['google', 'gemini-3.8-flash', tokens(0.75, 3.75)],
    ['google', 'gemini-nano-banana-2.1', { ...tokens(1.5, 7.5), perImageUsd: 0.0336 }],
    ['openrouter', 'anthropic/claude-fable-5.1', tokens(10, 50)],
    ['openrouter', 'anthropic/claude-opus-5.5', tokens(4, 20)],
    ['openrouter', 'anthropic/claude-sonnet-5.5', tokens(2, 10)],
    ['fal', 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', { ...tokens(0, 0), perSecondUsd: 0.07 }],
    ['fal', 'fal-ai/kling-video/v3/pro/image-to-video', { ...tokens(0, 0), perSecondUsd: 0.112 }],
    ['fal', 'fal-ai/ffmpeg-api/extract-frame', { ...tokens(0, 0), perSecondUsd: 0.0002 }],
  ] as const)('%s %s', (provider, model, want) => {
    expect(figures(provider, model)).toEqual(want);
    expect(priceFor(PRICES, provider, model, ON)!.source).toMatch(/read 2026-10-18/);
  });

  it('covers every row a provider charges for', () => {
    const paid = PRICES.filter((r) => r.provider !== 'mock' && r.from === undefined).map((r) => `${r.provider} ${r.model}`);
    expect(paid).toHaveLength(19);
  });
});

describe('an OpenAI call is charged the tokens it wrote to the prompt cache at the write rate (MONEY-1)', () => {
  it('the uncached prompt at $10, the cache reads at $1 and the writes at $12.50 per 1M on gpt-6-astra', async () => {
    const usage = { prompt_tokens: 16_500, completion_tokens: 800, prompt_tokens_details: { cached_tokens: 4000, cache_write_tokens: 12_000 } };
    const openai = fakeOpenAI([{ model: 'gpt-6-astra', choices: [{ finish_reason: 'stop', message: { content: 'ok' } }], usage }]);
    const res = await gateway({ clients: { openai: openai.client } }).complete(req({ profileId: 'openai', tier: 'big' }));
    // 500 uncached, 4,000 read and 12,000 written of 16,500 prompt tokens, and 800 output at $50 per 1M. At the input
    // rate the writes would come to $0.12, not $0.15.
    expect(res.costUsd).toBeCloseTo(0.005 + 0.004 + 0.15 + 0.04, 9);
    expect(ledgerLines()[0]).toMatchObject({ servedModel: 'gpt-6-astra', costUsd: res.costUsd });
    expect(ledgerLines()[0]).not.toHaveProperty('priceBasis');
  });
});

describe('a Gemini image is charged its text and thinking tokens on top of the image (B1)', () => {
  const image = (usageMetadata: Record<string, unknown>) =>
    fakeGoogle([
      {
        modelVersion: 'gemini-nano-banana-2.1',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Here it is.' }, { inlineData: { data: Buffer.from('jpeg-bytes').toString('base64'), mimeType: 'image/jpeg' } }] } }],
        usageMetadata,
      },
    ]);
  const ask = (google: ReturnType<typeof fakeGoogle>) => gateway({ clients: { google: google.client } }).image({ workspaceId: 'ws-1', runId: 'run-1', purpose: 'asset:web-page', profileId: 'balanced', prompt: 'A loaf', size: '1024x1024' });

  it('the image at $0.0336, the prompt at $1.50 per 1M, and the thinking and text at $7.50 per 1M', async () => {
    const res = await ask(image({ promptTokenCount: 30, candidatesTokenCount: 1130, thoughtsTokenCount: 400, candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1120 }, { modality: 'TEXT', tokenCount: 10 }] }));
    expect(res.costUsd).toBeCloseTo(0.0336 + 30 * 1.5e-6 + 410 * 7.5e-6, 9);
    expect(ledgerLines()[0]).toMatchObject({ kind: 'image', usage: { inputTokens: 30, outputTokens: 410, units: 1 } });
    expect(ledgerLines()[0]).not.toHaveProperty('priceBasis');
  });

  it('plans for 2,000 thinking and text tokens an image before the call (a planning number: Google gives none)', () => {
    const row = priceFor(PRICES, 'google', 'gemini-nano-banana-2.1', AT)!;
    expect(row.estimatedOutputTokensPerImage).toBe(2000);
    // The image, the prompt, and 2,000 tokens at $7.50 per 1M ($0.015).
    const withoutThinking = maxImageCost({ ...row, estimatedOutputTokensPerImage: 0 }, { prompt: 'A loaf' });
    expect(withoutThinking).toBeGreaterThan(0.0336);
    expect(maxImageCost(row, { prompt: 'A loaf' }) - withoutThinking).toBeCloseTo(tokenCost(row, { inputTokens: 0, outputTokens: 2000 }), 9);
    expect(tokenCost(row, { inputTokens: 0, outputTokens: 2000 })).toBe(0.015);
  });
});

/**
 * LC-TIERS (block 2): the long-context tiers, priced per call. Block 2 lets a very large brief run where before it
 * failed without spending, so the owner chose on 2026-10-21, "Approve, and price long-context tiers in W" ("As the
 * first, but W also records OpenAI's and Google's long-context rates and prices each call at its tier, since W lets
 * very large briefs run where today they fail without spending."). What the gateway reserves before a call and what it
 * records after it are both priced at the tier the call's prompt falls in, so the spend cap holds for a very large
 * brief. The pages, read on 2026-10-22: OpenAI's "Long: >272K input tokens" (gpt-6-astra, gpt-6.1-sol, gpt-6-luna) and
 * Google's "prompts > 200k tokens" (gemini-3.1-pro-preview). A prompt one token over the threshold pays the long rates on
 * every token of the call, its output too; the prompt is counted whole, its cached tokens included (Claude's reading:
 * neither page says how it is counted, and Anthropic's page counts "all of its input tokens, including cache reads and
 * cache writes" for the one Claude model it prices by prompt length).
 */
describe('long-context tiers: each call is priced at the tier its prompt falls in (LC-TIERS)', () => {
  const ON = new Date('2026-10-22T12:00:00Z');
  const at = (provider: Parameters<typeof priceFor>[1], model: string) => priceFor(PRICES, provider, model, ON)!;
  const usd = (tokens: number, perMTok: number) => (tokens * perMTok) / 1_000_000;

  it.each([
    ['openai', 'gpt-6-astra', 272_000, [10, 50], [20, 75]],
    ['openai', 'gpt-6.1-sol', 272_000, [2, 10], [4, 15]],
    ['openai', 'gpt-6-luna', 272_000, [0.1, 0.5], [0.2, 0.75]],
    ['google', 'gemini-3.1-pro-preview', 200_000, [2, 12], [4, 18]],
  ] as const)('%s %s: a prompt of %i input tokens at the short rates, one token more at the long rates, output included', (provider, model, threshold, short, long) => {
    const row = at(provider, model);
    expect(tokenCost(row, { inputTokens: threshold, outputTokens: 1000 })).toBeCloseTo(usd(threshold, short[0]) + usd(1000, short[1]), 6);
    expect(tokenCost(row, { inputTokens: threshold + 1, outputTokens: 1000 })).toBeCloseTo(usd(threshold + 1, long[0]) + usd(1000, long[1]), 6);
  });

  it("records the tiers as the pages give them: OpenAI's cached input and 30-minute writes too, where the short row records them", () => {
    expect(at('openai', 'gpt-6-astra').longContext).toEqual({ aboveInputTokens: 272_000, inputPerMTok: 20, outputPerMTok: 75, cacheReadPerMTok: 2, cacheWritePerMTok: 25 });
    expect(at('openai', 'gpt-6.1-sol').longContext).toEqual({ aboveInputTokens: 272_000, inputPerMTok: 4, outputPerMTok: 15, cacheReadPerMTok: 0.2, cacheWritePerMTok: 5 });
    // gpt-6-luna's cached input is not recorded at either tier (its row's trigger); its write rate is.
    expect(at('openai', 'gpt-6-luna').longContext).toEqual({ aboveInputTokens: 272_000, inputPerMTok: 0.2, outputPerMTok: 0.75, cacheWritePerMTok: 0.25 });
    // Google's context-cache rates are not recorded at either tier (the row's trigger).
    expect(at('google', 'gemini-3.1-pro-preview').longContext).toEqual({ aboveInputTokens: 200_000, inputPerMTok: 4, outputPerMTok: 18 });
  });

  it("counts the whole prompt, its cached tokens too, and charges OpenAI's cache reads and writes at the tier's rates", () => {
    const astra = at('openai', 'gpt-6-astra');
    // 72,001 uncached and 200,000 read from the cache: 272,001 in the prompt, so the long tier.
    expect(tokenCost(astra, { inputTokens: 272_001, cacheReadTokens: 200_000, outputTokens: 0 })).toBeCloseTo(usd(72_001, 20) + usd(200_000, 2), 9);
    // 50,000 uncached, 100,000 read and 150,000 written, and 1,000 output.
    expect(tokenCost(astra, { inputTokens: 300_000, cacheReadTokens: 100_000, cacheWriteTokens: 150_000, outputTokens: 1000 })).toBeCloseTo(usd(50_000, 20) + usd(100_000, 2) + usd(150_000, 25) + usd(1000, 75), 9);
  });

  it("charges a cache hit above Google's threshold at the long input rate, never at a short-context rate", () => {
    expect(tokenCost(at('google', 'gemini-3.1-pro-preview'), { inputTokens: 250_000, cacheReadTokens: 100_000, outputTokens: 0 })).toBeCloseTo(usd(250_000, 4), 9);
  });

  it('gives no other row a tier: Claude models (direct and through OpenRouter) bill a 900k-token prompt at the per-token rate of a 9k one, and so do Gemini 3.8 Flash and the image and video models', () => {
    const tiered = PRICES.filter((r) => r.longContext !== undefined).map((r) => `${r.provider} ${r.model}`);
    expect(tiered).toEqual(['openai gpt-6-astra', 'openai gpt-6.1-sol', 'openai gpt-6-luna', 'google gemini-3.1-pro-preview']);
    for (const row of PRICES.filter((r) => r.longContext === undefined)) {
      const small = tokenCost(row, { inputTokens: 9_000, outputTokens: 0 });
      const large = tokenCost(row, { inputTokens: 900_000, outputTokens: 0 });
      expect(large, `${row.provider} ${row.model}`).toBeCloseTo(small * 100, 6);
    }
  });

  it('reserves a completion at the tier its estimated prompt falls in (maxCompletionCost)', () => {
    const astra = at('openai', 'gpt-6-astra');
    expect(maxCompletionCost(astra, 272_000, 1000)).toBeCloseTo(usd(272_000, 10) + usd(1000, 50), 9);
    expect(maxCompletionCost(astra, 272_001, 1000)).toBeCloseTo(usd(272_001, 20) + usd(1000, 75), 9);
  });
});

describe('the gateway reserves and settles a very large prompt at its long-context tier (LC-TIERS)', () => {
  const usd = (tokens: number, perMTok: number) => (tokens * perMTok) / 1_000_000;
  /** A brief of `chars` ASCII characters: the estimate counts a third of a token each, plus 8 for the message. */
  const brief = (chars: number): CompletionRequest['messages'] => [{ role: 'user', content: [{ type: 'text', text: 'a'.repeat(chars) }] }];
  /** What a call was estimated at, read from the budget refusal a cap of one cent gives it before anything is sent. */
  const reservedAt = async (over: Partial<CompletionRequest>, clients: GatewayOptions['clients']) => {
    const g = gateway({ caps: { workspaceCapUsd: () => 0.01 }, ...(clients ? { clients } : {}) });
    const err = (await g.complete(req(over)).catch((e: unknown) => e)) as GatewayError;
    expect(err).toMatchObject({ code: 'budget-exceeded' });
    return err.budget!.estimateUsd;
  };

  it('reserves an OpenAI call whose estimated prompt is 272,000 tokens at the short rates, and one of 272,001 at the long rates', async () => {
    const openai = fakeOpenAI();
    // 815,976 characters are 271,992 tokens and 815,977 are 271,993, plus 8 for the message.
    expect(await reservedAt({ profileId: 'openai', tier: 'big', messages: brief(815_976) }, { openai: openai.client })).toBeCloseTo(usd(272_000, 10) + usd(1000, 50), 6);
    expect(await reservedAt({ profileId: 'openai', tier: 'big', messages: brief(815_977) }, { openai: openai.client })).toBeCloseTo(usd(272_001, 20) + usd(1000, 75), 6);
    expect(openai.calls).toHaveLength(0);
  });

  it('refuses a maximal brief on Google whose short-rate estimate would fit the cap, before anything is sent: the cap holds at the tier', async () => {
    const google = fakeGoogle();
    // 700,000 characters: 233,334 tokens and 8 for the message, above Google's 200k. At $2 / $12 it would be about $0.48.
    const tokens = 233_342;
    expect(usd(tokens, 2) + usd(1000, 12)).toBeLessThan(0.5);
    const g = gateway({ caps: { workspaceCapUsd: () => 0.5 }, clients: { google: google.client } });
    const err = (await g.complete(req({ profileId: 'google', tier: 'big', messages: brief(700_000) })).catch((e: unknown) => e)) as GatewayError;
    expect(err).toMatchObject({ code: 'budget-exceeded' });
    expect(err.budget!.estimateUsd).toBeCloseTo(usd(tokens, 4) + usd(1000, 18), 6);
    expect(google.calls).toHaveLength(0);
  });

  it('settles a call at the tier of the prompt the provider reports, and records that cost in the ledger', async () => {
    const openai = fakeOpenAI([{ model: 'gpt-6-astra-2026-09-30', choices: [{ finish_reason: 'stop', message: { content: 'ok' } }], usage: { prompt_tokens: 300_000, completion_tokens: 1000 } }]);
    const google = fakeGoogle([
      { modelVersion: 'gemini-3.1-pro-preview', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ok' }] } }], usageMetadata: { promptTokenCount: 250_000, candidatesTokenCount: 600, thoughtsTokenCount: 400 } },
    ]);
    const g = gateway({ clients: { openai: openai.client, google: google.client } });
    const a = await g.complete(req({ profileId: 'openai', tier: 'big' }));
    const b = await g.complete(req({ profileId: 'google', tier: 'big' }));
    // A dated snapshot of gpt-6-astra, at its row's tier.
    expect(a.costUsd).toBeCloseTo(usd(300_000, 20) + usd(1000, 75), 9);
    // Thinking tokens are output, at the tier's output rate.
    expect(b.costUsd).toBeCloseTo(usd(250_000, 4) + usd(1000, 18), 9);
    expect(ledgerLines().map((e) => e.costUsd)).toEqual([a.costUsd, b.costUsd]);
    expect(ledgerLines().map((e) => e.priceBasis)).toEqual([undefined, undefined]);
  });

  it("reads the tier from the call's price row, so a table the gateway is given is priced by its own tiers", async () => {
    const sol = priceFor(PRICES, 'openai', 'gpt-6.1-sol', new Date('2026-10-22T12:00:00Z'))!;
    const table: PriceRow[] = PRICES.map((r) => (r === sol ? { ...r, longContext: { aboveInputTokens: 500, inputPerMTok: 7, outputPerMTok: 70 } } : r));
    const openai = fakeOpenAI([{ model: 'gpt-6.1-sol', choices: [{ finish_reason: 'stop', message: { content: 'ok' } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } }]);
    const res = await gateway({ prices: table, clients: { openai: openai.client } }).complete(req({ profileId: 'openai', tier: 'mid' }));
    expect(res.costUsd).toBeCloseTo(usd(1000, 7) + usd(100, 70), 9);
  });
});
