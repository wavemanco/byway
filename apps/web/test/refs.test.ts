import { describe, expect, it } from 'vitest';
import { MIN_RANKING_REFS, REFS_NOTE, refsStatus, takesRefs } from '../src/view/refs.ts';
import { findClaims } from '../src/view/claims.ts';

describe('"Examples you admire" (ADR-0071)', () => {
  it('appears only for recipes that take your examples', () => {
    expect(takesRefs({ inputs: ['intent', 'refs', 'tells'] })).toBe(true);
    expect(takesRefs({ inputs: ['intent', 'tells'] })).toBe(false);
    expect(takesRefs(undefined)).toBe(false);
  });

  it('explains in one plain line what three examples change, without claiming either way works better', () => {
    expect(MIN_RANKING_REFS).toBe(3);
    expect(REFS_NOTE).toMatch(/three or more examples/);
    expect(REFS_NOTE).toMatch(/ranks your work against them/);
    expect(REFS_NOTE).toMatch(/quality bar/);
    expect(REFS_NOTE.split(/(?<=[.;])\s/).length).toBeLessThanOrEqual(3);
    expect(findClaims(REFS_NOTE)).toEqual([]);
  });

  it('says what the examples added so far will do', () => {
    expect(refsStatus(0)).toBe('No examples added.');
    expect(refsStatus(1)).toBe('1 example added. Add 2 more for the outside critique to rank against them.');
    expect(refsStatus(2)).toBe('2 examples added. Add 1 more for the outside critique to rank against them.');
    expect(refsStatus(3)).toBe('3 examples added. The outside critique will rank your work against them.');
  });
});
