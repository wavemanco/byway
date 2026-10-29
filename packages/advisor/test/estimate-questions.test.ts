/**
 * What one answer to a run's question commits to (estimateQuestions; UX-4 remainder): the Run screen shows it beside
 * "Run this step?" (Yes runs the optional's body) and beside a person's loop's question (No runs another round). The
 * runner has no estimator, and putting the figure in the workflow's own question text would change the workflow bundle
 * (ADR-0078), so the figure comes from the advisor's walk, the one the recipe's estimate is made by.
 */
import { c1, c4, c5, c6, PROTOCOL_CONFIGS } from '@byway/catalog';
import { PROFILES } from '@byway/gateway';
import { walk, type Loop, type Node, type Optional, type Recipe } from '@byway/recipe';
import { describe, expect, it } from 'vitest';
import { estimateQuestions, estimateRecipe, type PricingContext, type QuestionEstimate } from '../src/index.ts';

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
  it.each(PROTOCOL_CONFIGS.map((r) => [r.id, r]))('%s: one for each optional, each loop, each gate that asks a question that commits money, by its id, and none for anything else', (_id, recipe) => {
    const asking: Record<string, QuestionEstimate['asks']> = {};
    walk(recipe, (n) => {
      if (n.op === 'optional') asking[n.id] = 'optional';
      if (n.op === 'loop' && n.gate.metric === 'human') asking[n.id] = 'round';
      // B-107: "Use the best version so far?" and "Keep going anyway?" buy further rounds; "Use it anyway?" the rest.
      if (n.op === 'loop' && n.gate.metric !== 'human' && (n.gate.onCap === 'human' || n.gate.onNoConverge === 'recalibrate-human')) asking[n.id] = 'cap';
      if (n.op === 'gate') asking[n.id] = 'gate';
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

  // B-107: the other yes/no questions that lead to paid work.
  it("a critic or check loop's is one further round of its body: what No buys at its cap, or Yes to keep going", () => {
    const critic = node<Loop>(c4, 'critic-loop');
    const q = estimateQuestions(c4, BALANCED)['critic-loop']!;
    expect(q.asks).toBe('cap');
    expect(q.estimate).toEqual(estimateRecipe(alone(c4, critic.body), BALANCED));
    expect(q.estimate.modelCalls.low).toBeGreaterThan(0);
  });

  it("a gate's is what follows it, in its stage and the stages after, since Yes goes on with the run", () => {
    const gate = node<Node>(c5, 'launch-gate');
    const draft = node<Node>(c4, 'draft');
    // C5's launch gate ends the run: Yes uses the work, and nothing else runs.
    const last = estimateQuestions(c5, BALANCED)['launch-gate']!;
    expect(last.asks).toBe('gate');
    expect([last.estimate.modelCalls, last.estimate.highUsd]).toEqual([{ low: 0, high: 0 }, 0]);
    // A gate with a step after it in its seq and a stage after its own: both follow it, and nothing before it does.
    const twoStages = { ...c4, stages: [{ stage: 'D1', body: { op: 'seq', steps: [draft, gate, draft] } }, { stage: 'D2', body: draft }] } as Recipe;
    const after = estimateQuestions(twoStages, BALANCED)['launch-gate']!.estimate;
    const twoDrafts = estimateRecipe({ ...c4, stages: [{ stage: 'D1', body: { op: 'seq', steps: [draft, draft] } }] } as Recipe, BALANCED);
    expect(after).toEqual(twoDrafts);
  });

  // B-108: the figure is sized by the work beside the question when it is known.
  it('is sized by the work beside the question: a long draft of your own costs more a round than the planning size', () => {
    const planned = estimateQuestions(c6, BALANCED)['author-loop']!.estimate;
    const long = estimateQuestions(c6, { ...BALANCED, workTokens: 8000 })['author-loop']!.estimate;
    expect(long.highUsd).toBeGreaterThan(2 * planned.highUsd);
    expect(long.modelCalls).toEqual(planned.modelCalls);
    // At the planning size it is the planned figure.
    expect(estimateQuestions(c6, { ...BALANCED, workTokens: 1500 })['author-loop']!.estimate).toEqual(planned);
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
