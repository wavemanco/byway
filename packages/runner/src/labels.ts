/**
 * Candidate labels (spec §3.3 shared conventions): options shown to a model are labelled A, B, C… as "### A" headings,
 * and the unseeded answers of an overlap step V1, V2, V3. The runner maps a model's labels back to candidates, so
 * the labelling lives in one place. Pure: the workflow bundle imports it.
 */

/** A, B, … Z, AA, AB, … for the i-th item (0-based). */
export function labelOf(i: number): string {
  if (!Number.isInteger(i) || i < 0) throw new Error(`No label for index ${i}`);
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** The index a label stands for, or -1. */
export function indexOfLabel(label: string): number {
  if (!/^[A-Z]+$/.test(label)) return -1;
  let n = 0;
  for (const c of label) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

export const labels = (n: number): string[] => Array.from({ length: n }, (_, i) => labelOf(i));

const headed = (heads: readonly string[], texts: readonly string[]): string => texts.map((t, i) => `### ${heads[i]}\n${t.trim()}`).join('\n\n');

/** Texts as "### A" headings, each followed by its text. */
export function labelled(texts: readonly string[]): string {
  return headed(labels(texts.length), texts);
}

/** The unseeded control answers of an overlap step, as "### V1" headings. */
export function vanillaLabelled(texts: readonly string[]): string {
  return headed(
    texts.map((_, i) => `V${i + 1}`),
    texts,
  );
}
