import { describe, expect, it } from 'vitest';
import { labelOf } from '@byway/prompts/pure';
import { bestSnapshots, converging, OK_BAR, passes, plateaued, raiseAmount } from '../src/gates.ts';
import { indexOfLabel, labels } from '../src/labels.ts';
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

  it('keeps a rank gate’s share of the lineup it was written for when fewer references were given (GATE-1, convention C6)', () => {
    // C3: top 3 of 10 (refs knob 9). With 3 references the lineup is 4: only first place passes, not all but last.
    const c3 = (r: number, of: number): Score => ({ kind: 'rank', rank: r, of, writtenFor: 10 });
    expect([1, 2, 3, 4].filter((r) => passes(c3(r, 4), 'critic-rank', 3))).toEqual([1]);
    expect([1, 2, 3, 4, 5].filter((r) => passes(c3(r, 5), 'critic-rank', 3))).toEqual([1]);
    expect([...Array(10).keys()].map((i) => i + 1).filter((r) => passes(c3(r, 10), 'critic-rank', 3))).toEqual([1, 2, 3]);
    // C4, C5, C7: the middle of 5 (refs knob 4). Rank 3 of 4 is below the middle; 2 of 4 is not.
    const mid = (r: number, of: number): Score => ({ kind: 'rank', rank: r, of, writtenFor: 5 });
    expect([1, 2, 3, 4].filter((r) => passes(mid(r, 4), 'critic-rank', 3))).toEqual([1, 2]);
    expect([1, 2, 3, 4, 5].filter((r) => passes(mid(r, 5), 'critic-rank', 3))).toEqual([1, 2, 3]);
    // An averaged rank (two shuffles) is held to the same bar.
    expect(passes(mid(2.5, 4), 'critic-rank', 3)).toBe(false);
    // A score whose lineup size was not named keeps the threshold as written.
    expect(passes(rank(3, 4), 'critic-rank', 3)).toBe(true);
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
  it('maps @byway/prompts’ labels back to candidates, A…Z, AA… (the inverse of labelOf)', () => {
    for (let i = 0; i < 800; i++) expect(indexOfLabel(labelOf(i))).toBe(i);
    expect(labels(4)).toEqual(['A', 'B', 'C', 'D']);
    expect(indexOfLabel('a')).toBe(-1);
    expect(indexOfLabel('A1')).toBe(-1);
  });
});
