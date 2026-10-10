/**
 * F02 at admission (ADR-0092 stage 2): a model-composed recipe is held to COMPOSED_LIMITS (the composed profile's
 * COMPOSED-LIMIT), and every recipe to the engine's limits (ST3 'limit') and to a retrying gate at stage level (ST10
 * 'retry-scope'). Each case is one of the verification's, through the real checkAnswer; each was admitted before.
 */
import { describe, expect, it } from 'vitest';
import { c1, c5, c6, PROTOCOL_CONFIGS } from '@byway/catalog';
import type { Recipe } from '@byway/recipe';
import { checkAnswer } from '../src/index.ts';
import { fencedJson, PROMPTS } from './helpers.ts';

type N = Record<string, any>;
const clone = (r: Recipe): N => {
  const c = structuredClone(r) as N;
  delete c.hash;
  return c;
};
function admission(nearest: Recipe, raw: unknown): string[] {
  return checkAnswer(fencedJson(raw), nearest, { prompts: PROMPTS, catalog: PROTOCOL_CONFIGS }, 'composed-limits').violations.map((v) => (v.clause ? `${v.ruleId}:${v.clause}` : v.ruleId));
}
const stage = (r: N, s: string): N => r.stages.find((x: N) => x.stage === s);
/** C1's D2 critic loop. */
const criticLoop = (r: N): N => stage(r, 'D2').body.steps[0].body.steps[0];

describe('COMPOSED-LIMIT', () => {
  it('C1 copied as it is: admitted', () => {
    expect(admission(c1, clone(c1))).toEqual([]);
  });

  it('C1 with 17 seeded drafts', () => {
    const r = clone(c1);
    stage(r, 'D1').body.n = 17;
    expect(admission(c1, r)).toContain('COMPOSED-LIMIT');
  });

  it('C1 with its seeds nested 50 × 50', () => {
    const r = clone(c1);
    const seeds = stage(r, 'D1').body;
    stage(r, 'D1').body = { op: 'replicate', id: 'outer-x50', n: 50, body: { op: 'seq', steps: [{ ...seeds, n: 50 }, { op: 'pick', id: 'inner-pick', mode: 'H', k: 1, actor: 'human' }] } };
    expect(admission(c1, r)).toContain('COMPOSED-LIMIT');
  });

  it("C1's critic loop up to 13 rounds", () => {
    const r = clone(c1);
    criticLoop(r).gate.max = 13;
    expect(admission(c1, r)).toContain('COMPOSED-LIMIT');
  });

  it("C5's motion chain up to 9 links", () => {
    const r = clone(c5);
    stage(r, 'D2').body.steps[1].maxLinks = 9;
    expect(admission(c5, r)).toContain('COMPOSED-LIMIT');
  });

  it("C6's audit with 5 lenses", () => {
    const r = clone(c6);
    const lenses = stage(r, 'D2').body.body.steps[2].lenses as N[];
    const critic = lenses.find((l) => l.name === 'critic')!;
    lenses.push({ name: 'critic-2', body: { ...critic.body, id: 'critic-2' } }, { name: 'critic-3', body: { ...critic.body, id: 'critic-3' } });
    expect(admission(c6, r)).toContain('COMPOSED-LIMIT');
  });

  it('33 steps at once, from counts each within its limit (3 × 11)', () => {
    const r = clone(c1);
    const seeds = stage(r, 'D1').body;
    stage(r, 'D1').body = { op: 'replicate', id: 'outer-x3', n: 3, body: { op: 'seq', steps: [{ ...seeds, n: 11 }, { op: 'pick', id: 'inner-pick', mode: 'H', k: 1, actor: 'human' }] } };
    expect(admission(c1, r)).toEqual(['COMPOSED-LIMIT']);
  });

  it('more than 400 steps, from counts each within its limit (6 drafts, 12 rounds)', () => {
    const r = clone(c1);
    stage(r, 'D1').body.n = 6;
    criticLoop(r).gate.max = 12;
    expect(admission(c1, r)).toEqual(['COMPOSED-LIMIT']);
  });
});

describe('the engine limits and the retry placement, at compose', () => {
  it('C1 with a billion seeded drafts: ST3 limit, besides COMPOSED-LIMIT', () => {
    const r = clone(c1);
    stage(r, 'D1').body.n = 1e9;
    expect(admission(c1, r)).toEqual(expect.arrayContaining(['ST3:limit', 'COMPOSED-LIMIT']));
  });

  it('G1: C1 with a retrying one-shot gate inside each-candidate', () => {
    const r = clone(c1);
    const candidate = stage(r, 'D2').body.steps[0].body;
    const critic = structuredClone(criticLoop(r).body.steps[1]);
    candidate.steps.push(
      { op: 'step', id: 'gate-render', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] },
      { op: 'gate', id: 'candidate-gate', body: { ...critic, id: 'gate-critic' }, pass: { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, retry: { stage: 'D1', times: 1 }, onFail: 'human' },
    );
    expect(admission(c1, r)).toContain('ST10:retry-scope');
  });
});
