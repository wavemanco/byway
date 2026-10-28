/**
 * The flow walk is memoized (ADR-0092 follow-up). It walks a loop body (and a relay link) twice, so that effects
 * crossing the back-edge are seen, and so its cost doubled with each level of nested loops; ADR-0092 added walks of its
 * own over it (ST12's flow clauses, the composed profile's per-VOICE counts), and checkAnswer took about 1.5 to 2 times
 * main's time at 20 to 22 nested loops. Each rule now gives the walk an exact key of its state: a node walked again
 * from a state with the same key is answered from the first walk, its exits to the enclosing loop included.
 *
 * Sound: a rule's step reads only the step, its path, its stage, the state and whether it is contained, and records
 * findings idempotently, so a repeat walk from an equal state adds nothing. The property is checked, not argued: on
 * random recipes of every operator, the memoized walk gives exactly the verdict of the full one, finding for finding.
 */
import { describe, expect, it } from 'vitest';
import { loop, seq, step, type Gate, type Node, type Recipe, type Step } from '@byway/recipe';
import { flowRecipe, validate, withoutFlowMemo } from '../src/index.ts';
import { randomRecipe, rng } from './random-recipes.ts';

describe('the memoized walk finds exactly what the full walk finds', () => {
  it('on 600 random recipes of every operator, nested up to 4 levels: the same verdict, finding for finding', () => {
    const next = rng(20261009);
    let findings = 0;
    let unapplied = 0;
    for (let i = 0; i < 600; i++) {
      const r = randomRecipe(next, 4);
      const memoized = validate(r);
      expect(memoized).toEqual(withoutFlowMemo(() => validate(r)));
      findings += memoized.violations.length;
      unapplied += memoized.violations.filter((v) => v.clause === 'critique-unapplied').length;
    }
    // The recipes do exercise the rules: they are refused for many reasons, a person's unapplied list among them (read
    // on the walk that leaves a loop only where a run can).
    expect(findings).toBeGreaterThan(3000);
    expect(unapplied).toBeGreaterThan(0);
  });
});

const fix = (id: string): Step => step({ id, role: 'fix', actor: 'model', tier: 'mid', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true });
const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const critic = (id: string): Step => step({ id, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view'], produces: ['critique', 'score'] });
const voice = (id: string): Step => step({ id, role: 'voice', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true });
const gate: Gate = { metric: 'critic-score', threshold: 9, hidden: true, holder: 'harness', probe: 1, max: 2, onCap: 'human', onNoConverge: 'recalibrate-human' };

/** `depth` loops, each holding a render, a critic, the level inside, a fix and a VOICE. */
const nest = (depth: number): Node => Array.from({ length: depth }, (_, i) => i).reduce<Node>((n, i) => loop(`l${i}`, seq(render(`r${i}`), critic(`c${i}`), n, fix(`f${i}`), voice(`v${i}`)), gate), fix('core'));
const recipeOf = (body: Node): Recipe => ({ schema: 'byway.recipe/1', id: 'nest', title: 'Nest', kind: 'experimental', family: 'test', channel: 'workspace', medium: 'prose', inputs: ['intent'], stages: [{ stage: 'D2', body }], sitsOut: [], exceptions: [], bank: false });

/** Steps the walk applies, with a two-valued state like PR6's: armed by a VOICE, or not. */
function walked(r: Recipe, keyed: boolean): number {
  let calls = 0;
  flowRecipe<boolean>(r, false, {
    step: (s, _path, _stage, armed) => {
      calls++;
      return armed || s.role === 'voice';
    },
    join: (states) => states.some(Boolean),
    ...(keyed ? { key: (armed: boolean) => (armed ? '1' : '0') } : {}),
  });
  return calls;
}

describe('what the walk costs', () => {
  it('without a key it doubles with each level of nested loops (the reason)', () => {
    expect(walked(recipeOf(nest(10)), false)).toBeGreaterThan(2 ** 10);
  });

  it('with one, a nest of 22 loops is walked a bounded number of times per step (here at most 4: two states, each a first and a later round)', () => {
    const steps = 22 * 4 + 1;
    expect(walked(recipeOf(nest(22)), true)).toBeLessThanOrEqual(4 * steps);
  });

  // By what it would cost, not by the clock: walked whole, 40 levels would be about 2^40 walks, which no machine ends, so a
  // rule that gave the walk no key would hold this test until vitest's hang guard stopped it (backlog row B-120).
  it('the validator over a nest of 40 loops returns, so every rule keys its walk', () => {
    expect(validate(recipeOf(nest(40))).violations).toBeDefined();
  });
});
