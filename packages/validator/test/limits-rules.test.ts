/**
 * F02 at the validator (ADR-0092 stage 2): ST3 'limit' reports what the engine refuses to run (counts past its
 * limits, more steps at once or in all than it allows, too many bytes in flight), on every kind of recipe and with no
 * exception that relaxes it; ST10 'retry-scope' keeps a retrying gate out of replicate, each and audit, where a retry
 * would restart its stage while the branches beside it kept running (the verification's G1).
 */
import { describe, expect, it } from 'vitest';
import { each, oneShotGate, replicate, seq, step, type Each, type Recipe, type Replicate, type Seq } from '@byway/recipe';
import { validate } from '../src/index.ts';
import { baseline, studio } from './fixtures.ts';

const clauses = (r: Recipe) => validate(r).violations.map((v) => `${v.ruleId}${v.clause ? `:${v.clause}` : ''}`);
const limits = (r: Recipe) => clauses(r).filter((c) => c === 'ST3:limit' || c === 'ST10:retry-scope');

const d1 = (r: Recipe) => r.stages[0]!.body as Replicate;
const eachCandidate = (r: Recipe) => ((r.stages[1]!.body as Seq).steps[0] as Each).body as Seq;

describe('ST3 limit', () => {
  it.each(['protocol-config', 'variant', 'ablation', 'composed', 'baseline', 'experimental'] as const)('replicate 1e9 on a %s', (kind) => {
    const r = { ...studio(), kind };
    d1(r).n = 1e9;
    expect(limits(r)).toContain('ST3:limit');
  });

  it('a research baseline with 600 builds at once (B-Plain with x600)', () => {
    const r = baseline();
    r.stages[0]!.body = replicate('x600', 600, r.stages[0]!.body);
    // The count itself, and the 600 builds it puts in flight at once.
    expect(clauses(r)).toEqual(['ST3:limit', 'ST3:limit']);
  });

  it('an invariant: an exception that names ST3 cannot relax it', () => {
    const r = studio();
    d1(r).n = 1e9;
    const v = validate(r);
    expect(v.violations.filter((x) => x.ruleId === 'ST3').every((x) => x.class === 'invariant')).toBe(true);
  });

  it('300 seeds, then each over them: the bytes in flight (and here the 300 critic loops) are over, though 300 at once is not', () => {
    const r = studio();
    d1(r).n = 300;
    const messages = validate(r).violations.filter((v) => v.clause === 'limit').map((v) => v.message);
    expect(messages).toEqual([expect.stringMatching(/a run can take up to \d+ steps/), expect.stringMatching(/carry up to \d+ KB between them \(300 random strings/)]);
  });

  it('the studio fixture as it is: nothing', () => {
    expect(limits(studio())).toEqual([]);
  });
});

describe('ST10 retry-scope', () => {
  const gate = (id: string) =>
    oneShotGate(
      id,
      step({ id: `${id}-critic`, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view'], produces: ['critique', 'score'], knobs: { mode: 'OK' } }),
      { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' },
      { stage: 'D1', times: 1 },
    );
  const render = (id: string) => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });

  it("G1: a retrying gate inside each-candidate (C1's D2) is refused", () => {
    const r = studio();
    eachCandidate(r).steps.push(render('g-render'), gate('candidate-gate'));
    expect(limits(r)).toEqual(['ST10:retry-scope']);
  });

  it('the same gate at stage level is not', () => {
    const r = studio();
    (r.stages[1]!.body as Seq).steps.push(render('g-render'), gate('stage-gate'));
    expect(limits(r)).toEqual([]);
  });

  it('inside a replicate', () => {
    const r = studio();
    r.stages[0]!.body = replicate('x2', 2, seq(d1(studio()).body, render('g-render'), gate('seed-gate')));
    // The gate retries its own stage, D1, from inside the replicate.
    expect(limits(r)).toEqual(['ST10:retry-scope']);
  });

  it('without a retry a gate may sit in a fan-out', () => {
    const r = studio();
    const g = gate('candidate-gate');
    delete g.retry;
    eachCandidate(r).steps.push(render('g-render'), g);
    expect(limits(r)).toEqual([]);
    expect(each).toBeDefined();
  });
});
