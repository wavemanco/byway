import { describe, expect, it } from 'vitest';
import { FORBIDDEN_CLAIMS, findClaims } from '../src/view/claims.ts';

describe('the claims rule (spec §4, CR11)', () => {
  it('lists the forbidden efficacy phrases', () => {
    expect(FORBIDDEN_CLAIMS).toEqual(['research-backed', 'proven', 'studies show', 'outperforms', 'scientifically', 'clinically', 'guaranteed results']);
  });

  it('finds the phrases in any case and spelling', () => {
    expect(findClaims('A Research-Backed method')).toEqual(['research-backed']);
    expect(findClaims('research backed')).toEqual(['research-backed']);
    expect(findClaims('Studies show it Outperforms the rest')).toEqual(['studies show', 'outperforms']);
    expect(findClaims('A proven recipe')).toEqual(['proven']);
    expect(findClaims('Scientifically designed, clinically tested, with Guaranteed  results')).toEqual(['scientifically', 'clinically', 'guaranteed results']);
    expect(findClaims('guaranteed result')).toEqual(['guaranteed results']);
  });

  it('does not flag honest wording', () => {
    expect(findClaims('Untested — not yet studied')).toEqual([]);
    expect(findClaims('Conversion lift is unproven.')).toEqual([]);
    expect(findClaims('Nothing here is guaranteed.')).toEqual([]);
  });
});
