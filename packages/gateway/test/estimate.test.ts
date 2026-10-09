import { describe, expect, it } from 'vitest';
import { estimateInputTokens, imageTokens, maxImageCost, textTokens } from '../src/estimate.ts';
import type { PriceRow } from '../src/prices.ts';
import type { ResolvedMessage } from '../src/providers/types.ts';

/**
 * F04: the estimate contract (ADR-0091). Admission reserves planning estimates, not bounds. Where a cheap true bound
 * exists it is used: non-ASCII text counts at its UTF-8 bytes (byte-level tokenizers never make more tokens than bytes),
 * and an image whose size cannot be read counts at the image maximum.
 */

const text = (t: string): ResolvedMessage => ({ role: 'user', content: [{ type: 'text', text: t }] });
const image = (artifactId: string): ResolvedMessage => ({ role: 'user', content: [{ type: 'image', image: { artifactId, mediaType: 'image/webp', base64: '' } }] });

describe('textTokens', () => {
  it('counts ASCII at one token per three characters, as before', () => {
    expect(textTokens('a'.repeat(3000))).toBe(1000);
    expect(textTokens('')).toBe(0);
  });

  it('counts 3000 CJK characters at 9000 tokens or more: their UTF-8 bytes', () => {
    expect(textTokens('漢'.repeat(3000))).toBeGreaterThanOrEqual(9000);
  });

  it('counts mixed text as its ASCII part at a third plus the bytes of the rest', () => {
    // 'Café ' is 4 ASCII characters plus é (2 bytes); '日本' is 6 bytes.
    expect(textTokens('Café 日本')).toBe(Math.ceil(4 / 3) + 2 + 6);
  });

  it('counts emoji (surrogate pairs) at their 4 bytes', () => {
    expect(textTokens('🙂🙂')).toBe(8);
  });
});

describe('estimateInputTokens', () => {
  it('counts a non-Latin brief at its bytes, plus the per-message overhead', () => {
    expect(estimateInputTokens({ messages: [text('漢'.repeat(3000))], imageSizes: new Map() })).toBeGreaterThanOrEqual(9000);
  });

  it('counts a WebP (or any image) of unknown size at the 6400-token maximum', () => {
    expect(imageTokens(undefined)).toBe(6400);
    expect(estimateInputTokens({ messages: [image('sha256:w')], imageSizes: new Map([['sha256:w', undefined]]) })).toBe(8 + 6400);
  });

  it('keeps the formula for an image of known size, capped at the maximum', () => {
    expect(imageTokens({ width: 750, height: 100 })).toBe(100);
    expect(imageTokens({ width: 4000, height: 4000 })).toBe(6400);
  });

  it('counts the system text the same way', () => {
    expect(estimateInputTokens({ system: 'Привет', messages: [text('hi')], imageSizes: new Map() })).toBe(8 + 12 + 1);
  });
});

describe('maxImageCost', () => {
  it('counts a non-ASCII image prompt at its bytes', () => {
    const row: PriceRow = { provider: 'openai', model: 'x', inputPerMTok: 1_000_000, outputPerMTok: 0, source: 'test' };
    // $1 per token: 3000 CJK characters are 9000 bytes, plus the overhead of 8.
    expect(maxImageCost(row, { prompt: '漢'.repeat(3000) })).toBe(9008);
  });
});
