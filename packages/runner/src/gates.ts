/**
 * The hidden-threshold arithmetic of loops and one-shot gates (02 §2 "Loop-until: failure semantics"; spec §3.2;
 * ADR-0071). It runs in the workflow, outside every prompt: no critic ever sees a threshold (port rule 2). Pure.
 */
import type { Score } from './types.ts';

/** The hidden OK bar of 01 CRITIC: score ≥ 9/10. A GREAT critic without references falls back to it (ADR-0071). */
export const OK_BAR = 9;

/**
 * Whether a critic's answer meets a gate's hidden condition.
 * - `critic-score`: the score reaches the threshold (9 when none is given).
 * - `critic-rank`: our place is at or better than the threshold (lower is better). When the critic fell back to OK
 *   mode for want of references, the score is held to the OK bar instead.
 * A rank under a score gate passes only in first place (03 C1 GREAT: "ours ranked 1st").
 */
export function passes(score: Score, metric: string, threshold: number | undefined): boolean {
  if (score.kind === 'rank') {
    if (metric === 'critic-rank') return score.rank <= (threshold ?? 1);
    return score.rank === 1;
  }
  if (metric === 'critic-rank') return score.value >= OK_BAR;
  return score.value >= (threshold ?? OK_BAR);
}

/** One number where higher is better: the score, or the negated rank. */
export const goodness = (s: Score): number => (s.kind === 'score' ? s.value : -s.rank);

/**
 * The plateau rule: across the last `window` iterations the best gain over the first of them is below `minGain` (score
 * gates: under 0.5 over 2 iterations; rank gates: the same rank for 2 iterations). It applies only once the probe is
 * over, so a loop always gets its probe.
 */
export function plateaued(history: readonly Score[], plateau: { minGain: number; window: number } | undefined, probe: number): boolean {
  if (!plateau || plateau.window < 2) return false;
  const n = history.length;
  if (n < Math.max(plateau.window, probe + 1)) return false;
  const window = history.slice(n - plateau.window);
  const base = goodness(window[0]!);
  const best = Math.max(...window.slice(1).map(goodness));
  return best - base < plateau.minGain;
}

/** The bullet lines of a critique, normalized, for "does it name new gaps?". */
const gapsOf = (critique: string): Set<string> =>
  new Set(
    critique
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[-*•]\s+/.test(l))
      .map((l) => l.replace(/^[-*•]\s+/, '').toLowerCase().replace(/\s+/g, ' ')),
  );

/**
 * The probe check (02 §2): after `probe` fix iterations past the baseline, the loop must be converging. Either the
 * best score rose at least 1 point over the baseline (rank gates: our rank improved by at least 1), or the latest
 * critique names gaps the earlier ones did not.
 */
export function converging(history: readonly Score[], critiques: readonly string[]): boolean {
  if (history.length < 2) return true;
  const base = goodness(history[0]!);
  if (Math.max(...history.slice(1).map(goodness)) - base >= 1) return true;
  const latest = gapsOf(critiques.at(-1) ?? '');
  const earlier = new Set(critiques.slice(0, -1).flatMap((c) => [...gapsOf(c)]));
  return [...latest].some((g) => !earlier.has(g));
}

/** Indices of the best snapshots, best first (ties: the later one first), at most `k`. */
export function bestSnapshots(history: readonly Score[], k: number): number[] {
  return history
    .map((s, i) => ({ i, g: goodness(s) }))
    .sort((a, b) => b.g - a.g || b.i - a.i)
    .slice(0, k)
    .map((x) => x.i);
}

/** "Raise the budget by $X?": the shortfall rounded up to whole dollars, at least $1. */
export const raiseAmount = (shortfallUsd: number): number => Math.max(1, Math.ceil(shortfallUsd - 1e-9));
