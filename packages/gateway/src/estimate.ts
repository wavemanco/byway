import type { ImageRequest } from '@byway/contracts';
import { tokenCost, type PriceRow } from './prices.ts';
import type { ResolvedMessage } from './providers/types.ts';

/**
 * Pre-call cost estimates (spec §3.4): the gateway refuses a call whose worst case would break a cap, so estimates err
 * high. Text: one token per three characters (current tokenizers run about 30% above the old four-characters rule).
 * Images: width × height / 750 (Anthropic's vision formula, close for the others), capped, or a high default.
 */
const CHARS_PER_TOKEN = 3;
const PER_MESSAGE_OVERHEAD = 8;
const IMAGE_TOKENS_DEFAULT = 5000;
const IMAGE_TOKENS_MAX = 6400;

export function imageTokens(size: { width: number; height: number } | undefined): number {
  if (!size) return IMAGE_TOKENS_DEFAULT;
  return Math.min(IMAGE_TOKENS_MAX, Math.ceil((size.width * size.height) / 750));
}

export interface EstimateInput {
  system?: string;
  messages: ResolvedMessage[];
  /** Pixel sizes of the images, by artifact id, where known. */
  imageSizes: ReadonlyMap<string, { width: number; height: number } | undefined>;
}

export function estimateInputTokens(input: EstimateInput): number {
  let chars = input.system?.length ?? 0;
  let tokens = 0;
  for (const m of input.messages) {
    tokens += PER_MESSAGE_OVERHEAD;
    for (const p of m.content) {
      if (p.type === 'text') chars += p.text.length;
      else tokens += imageTokens(input.imageSizes.get(p.image.artifactId));
    }
  }
  return tokens + Math.ceil(chars / CHARS_PER_TOKEN);
}

/** Worst-case USD for a completion: estimated input plus the full output allowance. */
export function maxCompletionCost(price: PriceRow, inputTokens: number, maxOutputTokens: number): number {
  return tokenCost(price, { inputTokens, outputTokens: maxOutputTokens });
}

/** Worst-case USD for one generated image. */
export function maxImageCost(price: PriceRow, req: Pick<ImageRequest, 'prompt'>): number {
  const promptTokens = Math.ceil(req.prompt.length / CHARS_PER_TOKEN) + PER_MESSAGE_OVERHEAD;
  const outputTokens = price.estimatedOutputTokensPerImage ?? 0;
  return tokenCost(price, { inputTokens: promptTokens, outputTokens }) + (price.perImageUsd ?? 0);
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
