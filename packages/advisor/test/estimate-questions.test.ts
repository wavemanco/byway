/**
 * What one answer to a run's question commits to (estimateQuestions; UX-4 remainder): the Run screen shows it beside
 * "Run this step?" (Yes runs the optional's body) and beside a person's loop's question (No runs another round). The
 * runner has no estimator, and putting the figure in the workflow's own question text would change the workflow bundle
 * (ADR-0078), so the figure comes from the advisor's walk, the one the recipe's estimate is made by.
 */
import { c1, c4, c6, PROTOCOL_CONFIGS } from '@byway/catalog';
import { PROFILES } from '@byway/gateway';
import { walk, type Loop, type Node, type Optional, type Recipe } from '@byway/recipe';
import { describe, expect, it } from 'vitest';
import { estimateQuestions, estimateRecipe, type PricingContext } from '../src/index.ts';

const AT = new Date('2026-10-07T12:00:00Z');
const priced = (id: string): PricingContext => ({ profile: PROFILES.find((p) => p.id === id)!, images: true, video: true, otherFamily: true, at: AT });
const BALANCED = priced('balanced');

/** The recipe's node with this id. */
function node<T extends Node>(recipe: Recipe, id: string): T {
  let found: Node | undefined;
  walk(recipe, (n) => {
    if ('id' in n && n.id === id) found = n;
  });
  if (!found) throw new Error(`${recipe.id} has no node ${id}`);
  return found as T;
}

/** A recipe of one stage that is this node alone, as a stage's first node is walked: one draft, no stage to retry. */
const alone = (recipe: Recipe, body: Node): Recipe => ({ ...recipe, stages: [{ stage: 'D1', body }] }) as Recipe;

describe('the estimate of a question an optional or a person’s loop asks', () => {
  it.each(PROTOCOL_CONFIGS.map((r) => [r.id, r]))('%s: one for each optional and each loop a person ends, by its id, and none for anything else', (_id, recipe) => {
    const asking: Record<string, 'optional' | 'round'> = {};
    walk(recipe, (n) => {
      if (n.op === 'optional') asking[n.id] = 'optional';
      if (n.op === 'loop' && n.gate.metric === 'human') asking[n.id] = 'round';
    });
    const questions = estimateQuestions(recipe, BALANCED);
    expect(Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, q.asks]))).toEqual(asking);
    for (const q of Object.values(questions)) {
      expect(q.estimate.highUsd).toBeGreaterThanOrEqual(q.estimate.lowUsd);
      expect(q.estimate.lowUsd).toBeGreaterThanOrEqual(0);
    }
  });

  it("an optional's is its step run once: what the recipe's estimate counts for it only at its high end", () => {
    const framings = node<Optional>(c4, 'framings-if-wanted');
    const question = estimateQuestions(c4, BALANCED)['framings-if-wanted']!;
    expect(question.asks).toBe('optional');
    // The step alone, priced as the recipe prices it.
    expect(question.estimate).toEqual(estimateRecipe(alone(c4, framings.body), BALANCED));
    expect(question.estimate.lowUsd).toBeGreaterThan(0);
    expect(question.estimate.modelCalls).toEqual({ low: 1, high: 1 });
    // A recipe that is only this optional costs nothing at the low end (No) and the step at the high end (Yes).
    const only = estimateRecipe(alone(c4, framings), BALANCED);
    expect(only.lowUsd).toBe(0);
    expect(only.highUsd).toBe(question.estimate.highUsd);
  });

  it('inside a draft, an optional’s is for that one draft (C1 asks once per draft)', () => {
    const plain = node<Optional>(c1, 'asset-if-plain');
    const question = estimateQuestions(c1, BALANCED)['asset-if-plain']!;
    expect(question.estimate).toEqual(estimateRecipe(alone(c1, plain.body), BALANCED));
    expect(question.estimate.images.low).toBeGreaterThan(0);
  });

  it("a person's loop's is one more round of its body, which may hold its own loop (C4's recipient critique) or a person's turn (C6)", () => {
    const authorLoop = node<Loop>(c6, 'author-loop');
    const round = estimateQuestions(c6, BALANCED)['author-loop']!;
    expect(round.asks).toBe('round');
    expect(round.estimate).toEqual(estimateRecipe(alone(c6, authorLoop.body), BALANCED));
    expect(round.estimate.modelCalls.low).toBeGreaterThan(0);
    expect(round.estimate.humanMinutes.low).toBeGreaterThan(0);
    // An optional whose step is a loop of its own counts that loop's planned rounds.
    const critique = node<Optional>(c4, 'recipient-critic');
    expect(estimateQuestions(c4, BALANCED)['recipient-critic']!.estimate).toEqual(estimateRecipe(alone(c4, critique.body), BALANCED));
  });

  it('is priced with the profile asked for: nothing on the demo profile, more on the best than on balanced', () => {
    const demo = estimateQuestions(c4, priced('demo'))['framings-if-wanted']!.estimate;
    expect([demo.lowUsd, demo.highUsd]).toEqual([0, 0]);
    expect(demo.modelCalls).toEqual({ low: 1, high: 1 });
    expect(estimateQuestions(c4, priced('best'))['framings-if-wanted']!.estimate.highUsd).toBeGreaterThan(estimateQuestions(c4, BALANCED)['framings-if-wanted']!.estimate.highUsd);
  });

  it("leaves the recipe's own estimate as it was", () => {
    for (const recipe of PROTOCOL_CONFIGS) {
      const before = estimateRecipe(recipe, BALANCED);
      estimateQuestions(recipe, BALANCED);
      expect(estimateRecipe(recipe, BALANCED)).toEqual(before);
    }
  });
});
