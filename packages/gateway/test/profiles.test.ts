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
    expect([demo.tiers.big.provider, demo.tiers.mid.provider, demo.image?.provider, demo.video?.provider]).toEqual(['mock', 'mock', 'mock', 'mock']);
  });

  it('gives balanced and best a verified fal.ai image-to-video model for C5 relay links (ADR-0069)', () => {
    expect(byId('balanced').video).toEqual({ provider: 'fal', model: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video' });
    expect(byId('best').video).toEqual({ provider: 'fal', model: 'fal-ai/kling-video/v3/pro/image-to-video' });
  });

  it('reports video as usable only when the profile has a video model and its provider has a key', () => {
    const of = (env: Record<string, string>, id: string) => profileStatus(PROFILES, env).find((s) => s.profile.id === id);
    const anthropic = { ANTHROPIC_API_KEY: 'sk-ant-test-key-123456' };
    expect(of(anthropic, 'balanced')).toMatchObject({ usable: true, video: false });
    expect(of({ ...anthropic, FAL_KEY: 'id:secret-not-real' }, 'balanced')).toMatchObject({ usable: true, video: true });
    // Video does not make a profile usable: its text tiers still need their keys.
    expect(of({ FAL_KEY: 'id:secret-not-real' }, 'best')).toMatchObject({ usable: false, video: true });
    expect(of({ FAL_KEY: 'id:secret-not-real' }, 'openai')).toMatchObject({ video: false });
    expect(of({}, 'demo')).toMatchObject({ video: true });
  });

  it('prices every model a profile can call', () => {
    for (const p of PROFILES) {
      for (const ref of [p.tiers.big, p.tiers.mid, ...(p.image ? [p.image] : []), ...(p.video ? [p.video] : [])]) {
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
    expect(of('demo')).toMatchObject({ usable: true, images: true, video: true });
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

  it('prices fal.ai video per second, with the model page each figure was read from', () => {
    const v25 = priceFor(PRICES, 'fal', 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', today);
    expect(v25?.perSecondUsd).toBe(0.07);
    expect(v25?.source).toMatch(/fal\.ai\/models\/fal-ai\/kling-video\/v2\.5-turbo\/pro\/image-to-video.*2026-10-18/);
    const v3 = priceFor(PRICES, 'fal', 'fal-ai/kling-video/v3/pro/image-to-video', today);
    expect(v3?.perSecondUsd).toBe(0.112);
    expect(v3?.source).toMatch(/fal\.ai\/models\/fal-ai\/kling-video\/v3\/pro\/image-to-video.*2026-10-18/);
    expect(priceFor(PRICES, 'fal', 'fal-ai/ffmpeg-api/extract-frame', today)?.perSecondUsd).toBe(0.0002);
    expect(priceFor(PRICES, 'mock', 'mock-video', today)?.perSecondUsd).toBe(0);
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
