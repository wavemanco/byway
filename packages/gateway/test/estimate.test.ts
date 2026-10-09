import { describe, expect, it } from 'vitest';
import { estimateInputTokens, imageSize, imageTokens, maxImageCost, textTokens } from '../src/estimate.ts';
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

/** A RIFF/WEBP container with one chunk: `fourcc` and its `data`. */
function webp(fourcc: 'VP8 ' | 'VP8L' | 'VP8X', data: number[]): Uint8Array {
  const chunk = Buffer.concat([Buffer.from(fourcc, 'latin1'), Buffer.alloc(4), Buffer.from(data)]);
  chunk.writeUInt32LE(data.length, 4);
  const head = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1')]);
  head.writeUInt32LE(4 + chunk.length, 4);
  return new Uint8Array(Buffer.concat([head, chunk]));
}

describe('imageSize reads WebP headers (ADR-0095; the 6,400-token maximum is for what cannot be read)', () => {
  it('lossy (VP8): the 14-bit width and height after the frame start code', () => {
    // Frame tag (3 bytes), start code 9d 01 2a, then width 640 and height 480, little-endian, top two bits a scale.
    expect(imageSize(webp('VP8 ', [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01]))).toEqual({ width: 640, height: 480 });
    expect(imageSize(webp('VP8 ', [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x80, 0x42, 0xe0, 0xc1]))).toEqual({ width: 640, height: 480 });
  });

  it('lossless (VP8L): width and height minus one, 14 bits each, after the 0x2f signature', () => {
    const w = 1023;
    const h = 767;
    const bits = (w - 1) | ((h - 1) << 14);
    expect(imageSize(webp('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff]))).toEqual({ width: w, height: h });
  });

  it('extended (VP8X): the 24-bit canvas width and height minus one', () => {
    const w = 2000;
    const h = 1500;
    expect(imageSize(webp('VP8X', [0x10, 0, 0, 0, (w - 1) & 0xff, ((w - 1) >> 8) & 0xff, (w - 1) >> 16, (h - 1) & 0xff, ((h - 1) >> 8) & 0xff, (h - 1) >> 16]))).toEqual({ width: w, height: h });
  });

  it('a WebP of known size gets its real estimate, not the maximum', () => {
    const size = imageSize(webp('VP8 ', [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x00, 0x02, 0x00, 0x02]));
    expect(size).toEqual({ width: 512, height: 512 });
    expect(estimateInputTokens({ messages: [image('sha256:w')], imageSizes: new Map([['sha256:w', size]]) })).toBe(8 + Math.ceil((512 * 512) / 750));
  });

  it('a damaged or cut-off WebP is unknown, and counts at the maximum', () => {
    expect(imageSize(webp('VP8 ', [0x30, 0x01, 0x00, 0x00, 0x00, 0x00, 0x80, 0x02, 0xe0, 0x01]))).toBeUndefined();
    expect(imageSize(webp('VP8L', [0x00, 1, 2, 3, 4]))).toBeUndefined();
    expect(imageSize(webp('VP8X', [0x10, 0, 0]))).toBeUndefined();
    expect(imageSize(webp('VP8 ', [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x00, 0x00, 0x00, 0x00]))).toBeUndefined();
  });
});
