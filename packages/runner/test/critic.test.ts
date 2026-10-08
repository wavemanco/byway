/**
 * CRITIC modes and verdicts without Temporal: which note a fallback carries (LABEL-2), and the rank a GREAT critic
 * hands its gate, with the lineup size the gate's threshold was written for (GATE-1).
 */
import { describe, expect, it } from 'vitest';
import { FEW_REFS_NOTE, OK_FALLBACK_NOTE, planCritic, verdictOf, type Lineup } from '../src/activities/critic.ts';

const great = { knobs: { mode: 'GREAT', refs: 4 } };
const random = () => 0.5;

describe('the OK fallback says what was supplied (LABEL-2)', () => {
  it('no examples: the ADR-0071 note; one or two: says fewer than three were given', () => {
    expect(planCritic(great, [], random)).toMatchObject({ mode: 'OK', note: OK_FALLBACK_NOTE });
    expect(planCritic(great, ['a'], random)).toMatchObject({ mode: 'OK', note: FEW_REFS_NOTE });
    expect(planCritic(great, ['a', 'b'], random)).toMatchObject({ mode: 'OK', note: FEW_REFS_NOTE });
    expect(FEW_REFS_NOTE).toMatch(/^Fewer than three examples were supplied/);
    expect(planCritic(great, ['a', 'b', 'c'], random)).toMatchObject({ mode: 'GREAT' });
  });
});

describe('a GREAT verdict names the lineup its gate was written for (GATE-1)', () => {
  it('carries the refs knob plus ours with our rank', () => {
    const lineup: Lineup = { slots: {}, images: [], labels: ['A', 'B', 'C', 'D'], ours: 'B' };
    const v = verdictOf([{ answer: { mode: 'GREAT', critique: '### B\n- gap', ranking: ['A', 'B', 'C', 'D'] }, lineup }], 5);
    expect(v.score).toEqual({ kind: 'rank', rank: 2, of: 4, writtenFor: 5 });
  });
});
