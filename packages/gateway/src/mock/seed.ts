import { createHash } from 'node:crypto';

/** A 32-bit seed from text: the same prompt always yields the same mock output. */
export function seedOf(text: string): number {
  return createHash('sha256').update(text, 'utf8').digest().readUInt32BE(0);
}

export type Rand = () => number;

/** mulberry32: a tiny deterministic PRNG, plenty for picking palettes and phrasings. */
export function rng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rand: Rand, items: readonly T[]): T {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) throw new Error('pick from an empty list');
  return item;
}

/** A deterministic shuffle, then the first n. */
export function sample<T>(rand: Rand, items: readonly T[], n: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy.slice(0, n);
}

export function int(rand: Rand, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}
