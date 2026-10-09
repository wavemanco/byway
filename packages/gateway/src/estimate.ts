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
 * - Images: width × height / 750 (Anthropic's vision formula, close for the others), capped at IMAGE_TOKENS_MAX; an
 *   image whose size cannot be read (WebP, or damaged bytes) counts at the maximum.
 * - Output: the call's whole output allowance; gpt-image's per-image output figure is a planning number (prices.ts).
 * - Video: the clip's seconds at the per-second price, plus helper endpoints at their upper bound.
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

/** The planning estimate for a completion: estimated input plus the full output allowance. */
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

/** Width and height from PNG or JPEG bytes; undefined for other formats. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
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
