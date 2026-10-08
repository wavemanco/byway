/**
 * Candidate labels (spec §3.3 shared conventions). How labels look and how labelled slots are laid out ("### A",
 * "### V1") lives in @byway/prompts, so the templates, the gateway's mock and the runner cannot drift apart; this
 * module only adds what the runner needs on top: every label of a lineup, and the way back from a model's label to a
 * candidate. Pure: the workflow bundle imports it, so it imports the prompts package's pure entry.
 */
import { labelOf } from '@byway/prompts/pure';

/** The index a label stands for (A → 0, Z → 25, AA → 26), or -1. The inverse of labelOf. */
export function indexOfLabel(label: string): number {
  if (!/^[A-Z]+$/.test(label)) return -1;
  let n = 0;
  for (const c of label) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** The first n labels, in order: A, B, C… */
export const labels = (n: number): string[] => Array.from({ length: n }, (_, i) => labelOf(i));
