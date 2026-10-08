import { describe, expect, it } from 'vitest';
import { bestSnapshots, converging, OK_BAR, passes, plateaued, raiseAmount } from '../src/gates.ts';
import { indexOfLabel, labelOf, labelled, vanillaLabelled } from '../src/labels.ts';
import type { Score } from '../src/types.ts';

const score = (value: number): Score => ({ kind: 'score', value });
const rank = (r: number, of = 5): Score => ({ kind: 'rank', rank: r, of });

describe('hidden gate conditions', () => {
  it('passes a score gate at or above its threshold', () => {
    expect(passes(score(9), 'critic-score', 9)).toBe(true);
    expect(passes(score(8.5), 'critic-score', 9)).toBe(false);
    expect(passes(score(9), 'critic-score', undefined)).toBe(true);
  });

  it('passes a rank gate at or better than its threshold (lower is better)', () => {
    expect(passes(rank(3), 'critic-rank', 3)).toBe(true);
    expect(passes(rank(2), 'critic-rank', 3)).toBe(true);
    expect(passes(rank(4), 'critic-rank', 3)).toBe(false);
  });

  it('holds a rank gate to the hidden OK bar when the critic fell back to OK mode (ADR-0071)', () => {
    expect(OK_BAR).toBe(9);
    expect(passes(score(8), 'critic-rank', 3)).toBe(false);
    expect(passes(score(9), 'critic-rank', 3)).toBe(true);
  });
});

describe('plateau, probe and best snapshots', () => {
  it('finds a score plateau: less than the minimum gain over the window', () => {
    expect(plateaued([score(6), score(7), score(7.2)], { minGain: 0.5, window: 2 }, 1)).toBe(true);
    expect(plateaued([score(6), score(7), score(8)], { minGain: 0.5, window: 2 }, 1)).toBe(false);
  });

  it('finds a rank plateau: the same rank for two iterations', () => {
    expect(plateaued([rank(4), rank(4)], { minGain: 1, window: 2 }, 1)).toBe(true);
    expect(plateaued([rank(4), rank(3)], { minGain: 1, window: 2 }, 1)).toBe(false);
  });

  it('never calls a plateau before the probe is over', () => {
    expect(plateaued([score(6), score(6)], { minGain: 0.5, window: 2 }, 2)).toBe(false);
    expect(plateaued([score(6), score(6), score(6)], { minGain: 0.5, window: 2 }, 2)).toBe(true);
    expect(plateaued([score(6), score(6), score(6)], undefined, 1)).toBe(false);
  });

  it('calls a loop converging when the best score rose a point or the critique names new gaps', () => {
    expect(converging([score(6), score(7)], ['- a', '- a'])).toBe(true);
    expect(converging([score(6), score(6.5)], ['- a\n- b', '- a\n- b'])).toBe(false);
    expect(converging([score(6), score(6.5)], ['- a', '- c'])).toBe(true);
    expect(converging([rank(4), rank(3)], ['- a', '- a'])).toBe(true);
  });

  it('ranks snapshots best first, later first on ties', () => {
    expect(bestSnapshots([score(6), score(8), score(8), score(7)], 3)).toEqual([2, 1, 3]);
    expect(bestSnapshots([rank(4), rank(2), rank(3)], 2)).toEqual([1, 2]);
  });

  it('raises a budget by the shortfall in whole dollars', () => {
    expect(raiseAmount(0.2)).toBe(1);
    expect(raiseAmount(1)).toBe(1);
    expect(raiseAmount(1.01)).toBe(2);
    expect(raiseAmount(0)).toBe(1);
  });
});

describe('labels', () => {
  it('labels candidates A…Z, AA… and maps labels back', () => {
    expect([0, 1, 25, 26, 27].map(labelOf)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
    expect(['A', 'B', 'Z', 'AA'].map(indexOfLabel)).toEqual([0, 1, 25, 26]);
    expect(indexOfLabel('a')).toBe(-1);
  });

  it('lays options out as ### headings, and unseeded answers as V1, V2…', () => {
    expect(labelled(['one', 'two'])).toBe('### A\none\n\n### B\ntwo');
    expect(vanillaLabelled(['x'])).toBe('### V1\nx');
  });
});
