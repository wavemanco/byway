import type { ImageRequest } from '@byway/contracts';
import { tokenCost, type PriceRow } from './prices.ts';
import type { ResolvedMessage } from './providers/types.ts';

/**
 * Pre-call planning estimates (spec §3.4, ADR-0091). The gateway reserves a call's estimate against the caps and
 * refuses the call when the estimate would break one. These are planning estimates, not bounds: without the provider's
 * tokenizer no pre-call count is a bound, so a call can settle above what it reserved. Settlement records the true cost
 * from the provider's usage, and later calls are refused against it. Where a cheap true bound exists, it is used:
 * - Text: ASCII at one token per three characters (current tokenizers run about 30% above the old four-characters
 *   rule); every other character at its UTF-8 bytes, which bounds byte-level tokenizers (dense CJK text, accents and
 *   emoji would otherwise be counted at a third of a token per character).
 * - Images: width × height / 750 (Anthropic's vision formula, close for the others), capped at IMAGE_TOKENS_MAX. The size
 *   is read from PNG, JPEG and WebP headers; an image whose size cannot be read (damaged bytes) counts at the maximum.
 * - Output: the call's whole output allowance; gpt-image's per-image output figure is a planning number (prices.ts).
 * - Video: the clip's seconds at the per-second price, plus helper endpoints at their upper bound.
 * - Rates: the long-context tier of the model's row when the estimated prompt is longer than its threshold (tokenCost;
 *   LC-TIERS, block 2), so a very large prompt is reserved at the rates it will be billed at. The estimate runs high for
 *   English, so a prompt just under a threshold can be reserved at the tier and settle below it; that leans high.
 */
const CHARS_PER_TOKEN = 3;
const PER_MESSAGE_OVERHEAD = 8;
const IMAGE_TOKENS_MAX = 6400;

export function imageTokens(size: { width: number; height: number } | undefined): number {
  if (!size) return IMAGE_TOKENS_MAX;
  return Math.min(IMAGE_TOKENS_MAX, Math.ceil((size.width * size.height) / 750));
}

/** ASCII characters, and the UTF-8 bytes of everything else, in a text. */
function textParts(text: string): { ascii: number; otherBytes: number } {
  let ascii = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 0x80) ascii++;
  return { ascii, otherBytes: Buffer.byteLength(text, 'utf8') - ascii };
}

/** The planning estimate for one text: its ASCII at a third of a token per character, the rest at its UTF-8 bytes. */
export function textTokens(text: string): number {
  const { ascii, otherBytes } = textParts(text);
  return Math.ceil(ascii / CHARS_PER_TOKEN) + otherBytes;
}

export interface EstimateInput {
  system?: string;
  messages: ResolvedMessage[];
  /** Pixel sizes of the images, by artifact id, where known. */
  imageSizes: ReadonlyMap<string, { width: number; height: number } | undefined>;
}

export function estimateInputTokens(input: EstimateInput): number {
  let ascii = 0;
  let otherBytes = 0;
  const add = (text: string) => {
    const parts = textParts(text);
    ascii += parts.ascii;
    otherBytes += parts.otherBytes;
  };
  if (input.system) add(input.system);
  let tokens = 0;
  for (const m of input.messages) {
    tokens += PER_MESSAGE_OVERHEAD;
    for (const p of m.content) {
      if (p.type === 'text') add(p.text);
      else tokens += imageTokens(input.imageSizes.get(p.image.artifactId));
    }
  }
  return tokens + Math.ceil(ascii / CHARS_PER_TOKEN) + otherBytes;
}

/** The planning estimate for a completion: estimated input plus the full output allowance, at the estimate's tier. */
export function maxCompletionCost(price: PriceRow, inputTokens: number, maxOutputTokens: number): number {
  return tokenCost(price, { inputTokens, outputTokens: maxOutputTokens });
}

/** The planning estimate for one generated image. */
export function maxImageCost(price: PriceRow, req: Pick<ImageRequest, 'prompt'>): number {
  const promptTokens = textTokens(req.prompt) + PER_MESSAGE_OVERHEAD;
  const outputTokens = price.estimatedOutputTokensPerImage ?? 0;
  return tokenCost(price, { inputTokens: promptTokens, outputTokens }) + (price.perImageUsd ?? 0);
}

/**
 * The estimate for one clip: its seconds at the model's per-second price, plus the helper endpoints the call also uses
 * (each priced per second, at its bound on seconds). fal bills the seconds requested, so this one settles as estimated.
 */
export function maxVideoCost(price: PriceRow, seconds: number, extras: readonly { price: PriceRow; seconds: number }[] = []): number {
  return (price.perSecondUsd ?? 0) * seconds + extras.reduce((usd, x) => usd + (x.price.perSecondUsd ?? 0) * x.seconds, 0);
}

/** Width and height from PNG, JPEG or WebP bytes; undefined for other formats, and for headers that cannot be read. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length >= 16 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return webpSize(b);
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return undefined;
      const marker = b[i + 1] as number;
      const len = b.readUInt16BE(i + 2);
      // SOF0–SOF15 carry the frame size, except DHT (C4), JPG (C8) and DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return undefined;
}

/**
 * A WebP's size from its first chunk (Google's WebP container and bitstream specifications), so a WebP gets its real
 * estimate instead of the 6,400-token maximum (ADR-0095):
 * - 'VP8 ' (lossy): after a 3-byte frame tag and the start code 9d 01 2a, the width and height as 14-bit little-endian
 *   numbers (the top two bits of each are a scale, not size);
 * - 'VP8L' (lossless): after the signature byte 0x2f, width − 1 and height − 1 in 14 bits each;
 * - 'VP8X' (extended: alpha, animation, metadata): after 4 bytes of flags, the canvas width − 1 and height − 1 in 24 bits each.
 * Anything else, or a header cut short, is unknown.
 */
function webpSize(b: Buffer): { width: number; height: number } | undefined {
  const chunk = b.toString('latin1', 12, 16);
  const known = (width: number, height: number) => (width > 0 && height > 0 ? { width, height } : undefined);
  if (chunk === 'VP8 ' && b.length >= 30) {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return undefined;
    return known(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
  }
  if (chunk === 'VP8L' && b.length >= 25) {
    if (b[20] !== 0x2f) return undefined;
    const bits = b.readUInt32LE(21);
    return known((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === 'VP8X' && b.length >= 30) return known(b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1);
  return undefined;
}
