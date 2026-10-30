/**
 * F01 (a): a person's admitted answer that the run left unused is found from what ran (@byway/recipe unusedAnswers, read
 * from the run's events), so the Run screen can say so. Through the real workflow, worker and Runner client: a composed
 * recipe whose list only one route branch applies, run down each branch, and every protocol configuration on its usual
 * run, where every answer of yours is used. Nothing is refused: the route recipe is admitted (decision 7's some path).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROTOCOL_CONFIGS } from '@byway/catalog';
import { answerUnusedAfter, personCritique, placements, unappliedCritiques, unusedAnswers, type Recipe } from '@byway/recipe';
import type { RunView } from '@byway/contracts';
import { checkEvents } from './helpers/events.ts';
import { AUTHOR_DRAFT, createHarness, type Answer, type Harness } from './helpers/harness.ts';
import { reseededTrim, routedTrim, twoTrims } from './helpers/recipes.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 120_000);
afterAll(async () => {
  await h?.close();
}, 60_000);

const unused = (recipe: Recipe, view: RunView) => unusedAnswers(recipe, view.events, view.checkpoints);

/** Takes this branch of the route, and answers the rest as the harness does. */
const branch =
  (name: 'ai' | 'own', list = '- Remove the second call to action.'): Answer =>
  (cp) => {
    if (cp.kind === 'choose') return { checkpointId: cp.id, choice: [name] };
    if (cp.kind === 'directive') return { checkpointId: cp.id, text: list };
    return undefined;
  };

// The check of F01 (a): a pick that keeps every option (k at least the options) runs with no event of its own, so a
// cut-down recipe that left it out moved no candidate's work into the work, and named an applied answer unused.
describe('an answer the candidates applied, then a pick that took them all without an event', () => {
  it('is not named unused', async () => {
    expect(answerUnusedAfter(twoTrims, 'trim', new Set(['apply-cut']))).toBe(false);
    const run = await h.start(twoTrims);
    const view = await h.drive(run.id, (cp) => (cp.kind === 'directive' ? { checkpointId: cp.id, text: '- Remove the second call to action.' } : undefined));
    expect(view.run.status).toBe('done');
    expect(view.events.some((e) => e.stepId === 'pick')).toBe(false);
    expect(unused(twoTrims, view)).toEqual([]);
  }, 60_000);
});

// The owner's choice of 2026-10-29 on F01 (f): the walk reads C1's seed as writing its direction on every run, so on a
// run whose seed wrote none (it stored the work alone) the notice cannot tell, and must not say "unused".
describe('a seed on C1\'s prompt ran after the answer', () => {
  const trim = { id: 'cp-trim', stepId: 'trim', kind: 'directive', prompt: 'What should go?', status: 'resolved', resolution: { text: '- Remove the second call to action.' } };
  const ran = (outputArtifactIds: string[]) => [
    { seq: 1, type: 'checkpoint-resolved', stepId: 'trim', data: { checkpointId: 'cp-trim' } },
    { seq: 2, type: 'step-finished', stepId: 'trim', data: { costUsd: 0 } },
    { seq: 3, type: 'step-started', stepId: 'own-revise', data: {} },
    { seq: 4, type: 'step-finished', stepId: 'own-revise', data: { costUsd: 0 } },
    { seq: 5, type: 'step-started', stepId: 'reseed', data: {} },
    { seq: 6, type: 'step-finished', stepId: 'reseed', data: { costUsd: 0.01, outputArtifactIds } },
  ];

  it('names the answer when the seed wrote its direction, as the walk reads it', () => {
    expect(answerUnusedAfter(reseededTrim, 'trim', new Set(['own-revise', 'reseed']))).toBe(true);
    expect(unusedAnswers(reseededTrim, ran(['sha256:work', 'sha256:direction']), [trim])).toEqual([{ checkpointId: 'cp-trim', stepId: 'trim', question: 'What should go?' }]);
  });

  it('says nothing when the seed wrote no direction', () => {
    expect(unusedAnswers(reseededTrim, ran(['sha256:work']), [trim])).toEqual([]);
  });
});

describe('an answer applied only on a route branch the run did not take', () => {
  it('is admitted: some path hands it on (ADR-0098 decision 7), and without that path it would be refused', () => {
    expect(unappliedCritiques(routedTrim)).toEqual([]);
    // The control: the AI branch is what hands it on. Read on what runs after it without that branch, it reaches nothing.
    expect(answerUnusedAfter(routedTrim, 'trim', new Set(['own-revise']))).toBe(true);
    expect(answerUnusedAfter(routedTrim, 'trim', new Set(['apply-cut']))).toBe(false);
  });

  it('ends with the answer named as unused when you revise the draft yourself', async () => {
    const run = await h.start(routedTrim);
    const view = await h.drive(run.id, branch('own'));
    expect(view.run.status).toBe('done');
    checkEvents(view);
    const trim = view.checkpoints.find((c) => c.stepId === 'trim')!;
    expect(unused(routedTrim, view)).toEqual([{ checkpointId: trim.id, stepId: 'trim', question: trim.prompt }]);
    expect(trim.prompt).toMatch(/^What should go\? List what to remove/);
  }, 60_000);

  it('names none when the AI applies it', async () => {
    const run = await h.start(routedTrim);
    const view = await h.drive(run.id, branch('ai'));
    expect(view.run.status).toBe('done');
    checkEvents(view);
    expect(view.events.some((e) => e.type === 'step-finished' && e.stepId === 'apply-cut' && !e.data.passed)).toBe(true);
    expect(unused(routedTrim, view)).toEqual([]);
  }, 60_000);

  it('names none when you listed nothing: there was no answer to use', async () => {
    const run = await h.start(routedTrim);
    const view = await h.drive(run.id, branch('own', '  '));
    expect(view.run.status).toBe('done');
    expect(unused(routedTrim, view)).toEqual([]);
  }, 60_000);
});

describe('the protocol configurations on their usual runs', () => {
  const inputs: Record<string, { draft?: string }> = { c3: { draft: AUTHOR_DRAFT }, c6: { draft: AUTHOR_DRAFT }, c6a: { draft: AUTHOR_DRAFT } };
  for (const recipe of PROTOCOL_CONFIGS) {
    it(`${recipe.id}: every answer of yours is used, so none is named`, async () => {
      const run = await h.start(recipe, { problem: { text: 'A short piece on teaching fractions with recipes' }, ...(inputs[recipe.id] ? { inputs: inputs[recipe.id] } : {}) });
      const view = await h.drive(run.id, (cp) => (recipe.id === 'c3' && cp.kind === 'choose' ? { checkpointId: cp.id, choice: ['own'] } : undefined));
      expect(view.run.error).toBeUndefined();
      expect(view.run.status).toBe('done');
      // The run asked for your answers, so the check had something to read: where the configuration asks for a list of
      // yours (C1, C3, C4 and C5's CUT), you gave one.
      expect(view.checkpoints.some((c) => c.status === 'resolved')).toBe(true);
      const lists = placements(recipe).filter((p) => personCritique(p.step)).map((p) => p.step.id);
      expect(lists.length > 0).toBe(['c1', 'c3', 'c4', 'c5'].includes(recipe.id));
      for (const id of lists) expect(view.checkpoints.some((c) => c.stepId === id && c.status === 'resolved' && !!c.resolution?.text?.trim()), `${recipe.id}: ${id} answered`).toBe(true);
      expect(unused(recipe, view)).toEqual([]);
    }, 120_000);
  }
});
