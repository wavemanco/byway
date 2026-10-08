import { labelledItems, labelsIn } from './extract.ts';
import { pick, rng } from './seed.ts';

/**
 * Demo-mode answers for the glue steps of 03 C2 (recipe roles `dedupe` and `overlap`). Both read the labels the prompt
 * shows ("### A" headings for the options; "### V1" for the unseeded answers in an overlap step) and answer only with
 * labels they were shown, as the runner maps labels back to candidates.
 */

/** The option labels shown: "### A" headings, else any labelled candidates the prompt names. */
function shownLabels(prompt: string): string[] {
  const headed = labelledItems(prompt).map((i) => i.label);
  return headed.length ? [...new Set(headed)] : labelsIn(prompt);
}

/**
 * dedupe: `{"keep":[…],"merged":[{"into","from":[…]}]}`. A field of four or more has near-duplicates in the demo: one
 * merge per four options (at most three), each folding a late option into an early one. Every shown label is either
 * kept or merged, never both.
 */
export function dedupe(prompt: string): { keep: string[]; merged: { into: string; from: string[] }[] } {
  const labels = shownLabels(prompt);
  const merges = Math.min(3, Math.floor(labels.length / 4));
  const merged = Array.from({ length: merges }, (_, i) => ({ into: labels[i] as string, from: [labels[labels.length - 1 - i] as string] }));
  const folded = new Set(merged.flatMap((m) => m.from));
  return { keep: labels.filter((l) => !folded.has(l)), merged };
}

const OVERLAP_NOTES = [
  'Shares its hook with the plain answer; the obvious version of this idea.',
  'Lands on the same premise a request with no spark produced.',
  'Same angle as the unseeded answer, in different words.',
];

/**
 * overlap: `{"flags":[{"label","overlapsWith","note"}]}`, an annotation only. One seeded option is flagged against one
 * unseeded answer when both are shown; with nothing to compare, nothing is flagged.
 */
export function overlap(seed: number, prompt: string): { flags: { label: string; overlapsWith: string; note: string }[] } {
  const vanilla = labelledItems(prompt, true).map((i) => i.label);
  const seeded = shownLabels(prompt);
  if (!vanilla.length || !seeded.length) return { flags: [] };
  const rand = rng(seed);
  return { flags: [{ label: pick(rand, seeded), overlapsWith: pick(rand, vanilla), note: pick(rand, OVERLAP_NOTES) }] };
}
