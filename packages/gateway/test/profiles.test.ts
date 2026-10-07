import { describe, expect, it } from 'vitest';
import { PRICES, priceFor, tokenCost } from '../src/prices.ts';
import { OPENROUTER_PINS, PROFILES, profileStatus } from '../src/profiles.ts';

const byId = (id: string) => {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) throw new Error(`no profile ${id}`);
  return p;
};
const today = new Date('2026-10-07T12:00:00Z');

describe('profiles', () => {
  it('has unique ids and the profiles the spec requires', () => {
    const ids = PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['balanced', 'best', 'demo', 'openai', 'google']));
  });

  it('maps balanced and best to the verified Claude models', () => {
    expect(byId('balanced').tiers).toEqual({
      big: { provider: 'anthropic', model: 'claude-opus-5-5' },
      mid: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
    });
    expect(byId('best').tiers).toEqual({
      big: { provider: 'anthropic', model: 'claude-fable-5-1' },
      mid: { provider: 'anthropic', model: 'claude-opus-5-5' },
    });
  });

  it('runs demo entirely on the mock', () => {
    const demo = byId('demo');
    expect([demo.tiers.big.provider, demo.tiers.mid.provider, demo.image?.provider]).toEqual(['mock', 'mock', 'mock']);
  });

  it('prices every model a profile can call', () => {
    for (const p of PROFILES) {
      for (const ref of [p.tiers.big, p.tiers.mid, ...(p.image ? [p.image] : [])]) {
        expect(priceFor(PRICES, ref.provider, ref.model, today), `${p.id}: ${ref.provider}/${ref.model}`).toBeDefined();
      }
    }
  });

  it('pins every OpenRouter model to one upstream provider', () => {
    for (const p of PROFILES) {
      for (const ref of [p.tiers.big, p.tiers.mid]) {
        if (ref.provider === 'openrouter') expect(OPENROUTER_PINS[ref.model]).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });

  it('is usable only when its text-tier providers have keys, and never exposes them', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-test-key-123456' };
    const status = profileStatus(PROFILES, env);
    const of = (id: string) => status.find((s) => s.profile.id === id);
    expect(of('balanced')).toMatchObject({ usable: true, missing: [], images: false });
    expect(of('best')).toMatchObject({ usable: true, images: false });
    expect(of('openai')).toMatchObject({ usable: false, missing: ['openai'] });
    expect(of('google')).toMatchObject({ usable: false, missing: ['google'] });
    expect(of('openrouter')).toMatchObject({ usable: false, missing: ['openrouter'] });
    expect(of('demo')).toMatchObject({ usable: true, images: true });
    expect(JSON.stringify(status)).not.toContain('sk-ant-test-key');
  });
});

describe('prices', () => {
  it('records a dated source for every row', () => {
    for (const row of PRICES) expect(row.source, `${row.provider}/${row.model}`).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('applies scheduled price changes on their date', () => {
    expect(priceFor(PRICES, 'google', 'gemini-3.8-flash', today)?.inputPerMTok).toBe(0.75);
    expect(priceFor(PRICES, 'google', 'gemini-3.8-flash', new Date('2027-01-01T00:00:00Z'))?.inputPerMTok).toBe(1.5);
  });

  it('returns undefined for an unknown model', () => {
    expect(priceFor(PRICES, 'anthropic', 'claude-unknown', today)).toBeUndefined();
  });

  it('computes token cost, pricing cache reads and writes at their own rates', () => {
    const opus = priceFor(PRICES, 'anthropic', 'claude-opus-5-5', today);
    if (!opus) throw new Error('missing');
    // 1M input at $4 + 0.5M output at $20.
    expect(tokenCost(opus, { inputTokens: 1_000_000, outputTokens: 500_000 })).toBe(14);
    // 1M input of which 0.5M cache reads ($0.20) and 0.25M cache writes ($5).
    expect(tokenCost(opus, { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 500_000, cacheWriteTokens: 250_000 })).toBe(1 + 0.1 + 1.25);
  });
});
