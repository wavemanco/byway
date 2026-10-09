import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompletionRequest } from '@byway/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGateway, type GatewayOptions } from '../src/gateway.ts';
import { PRICES, priceFor, servedPrice } from '../src/prices.ts';
import { anthropicMessage, fakeAnthropic, fakeGoogle, fakeOpenAI, MemoryArtifacts } from './fakes.ts';

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

  it("prices a dated snapshot of a known fallback model at that model's own row, unflagged", async () => {
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
        usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 1290 },
      },
    ]);
    const g = gateway({ clients: { google: google.client } });
    const res = await g.image({ workspaceId: 'ws-1', purpose: 'asset:web-page', profileId: 'balanced', prompt: 'A loaf', size: '1024x1024' });
    expect(res.costUsd).toBeCloseTo(0.0336 + 30 * 1.5e-6, 9);
    expect(ledgerLines()[0]).toMatchObject({ kind: 'image', priceBasis: 'assumed' });
  });
});
