import { describe, expect, it } from 'vitest';
import { DerivationError, critiqueSelf, each, leaveOneOut, loop, recipeHash, replicate, step, type Recipe } from '../src/index.ts';
import { minimalRecipe } from './fixtures.ts';

const gate = {
  metric: 'critic-score',
  threshold: 9,
  hidden: true,
  holder: 'worker' as const,
  probe: 2,
  max: 5,
  onCap: 'human' as const,
  onNoConverge: 'recalibrate-human' as const,
};

function loopOnly(): Recipe {
  const r = minimalRecipe();
  r.stages = [
    { stage: 'D1', body: replicate('x2', 2, r.stages[0]!.body) },
    {
      stage: 'D2',
      body: each(
        'each-candidate',
        loop(
          'critic-loop',
          step({ id: 'critic', role: 'critic', actor: 'model', tier: 'big', isolated: true, consumes: ['view'], produces: ['score'] }),
          gate,
        ),
      ),
    },
  ];
  return r;
}

describe('leaveOneOut', () => {
  it('refuses a bypass that removes nothing', () => {
    expect(() => leaveOneOut(minimalRecipe(), 'CRITIC')).toThrow(DerivationError);
    expect(() => leaveOneOut(minimalRecipe(), 'D3')).toThrow(/nothing for the D3 bypass/);
  });

  it('refuses to leave a container empty', () => {
    expect(() => leaveOneOut(loopOnly(), 'CRITIC')).toThrow(/each "each-candidate"/);
  });

  it('records the parent hash and the transform', () => {
    const r = loopOnly();
    const d2 = r.stages[1]!.body;
    if (d2.op !== 'each') throw new Error('fixture');
    d2.body = { op: 'seq', steps: [d2.body, step({ id: 'tail', role: 'render', actor: 'tool', consumes: [], produces: [] })] };
    const a = leaveOneOut(r, 'CRITIC');
    expect(a.parent).toEqual({ hash: recipeHash(r), derivation: { transform: 'leave-one-out', version: 1, target: 'CRITIC' } });
    expect(a.id).toBe('minimal-no-critic');
  });

  it('does not mutate its source', () => {
    const r = loopOnly();
    const before = JSON.stringify(r);
    critiqueSelf(r);
    expect(JSON.stringify(r)).toBe(before);
  });
});

describe('critiqueSelf', () => {
  it('needs a critic', () => {
    expect(() => critiqueSelf(minimalRecipe())).toThrow(DerivationError);
  });
});
