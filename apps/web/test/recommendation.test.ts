/**
 * The Recommendation screen's owned state (F14, ADR-0082): one state, changed only by its own transitions, each
 * applying a command's whole result at once. No client-made default recipe, ever.
 */
import { describe, expect, it } from 'vitest';
import type { Recommendation } from '@byway/contracts';
import type { ComposeView } from '../src/server/api.ts';
import { composedAfterStart, composedReady, initialRecState, recovered, rerouted, retryFailed, screen, selected, type RecState } from '../src/view/recommendation.ts';
import { COMPOSED_CHANGED, COMPOSED_REFUSED, HELD_KEY_REFUSAL } from '../src/view/refusals.ts';
import { composedRefusalGroups, composeNotice } from '../src/view/composed.ts';

const rec = (recipeId: string): Recommendation =>
  ({
    recipeId,
    fit: 'strong',
    why: `Why ${recipeId}`,
    answers: [],
    alternatives: [],
    routes: {},
    composeSuggested: false,
    presentation: { recipeId, name: recipeId.toUpperCase() },
  }) as unknown as Recommendation;

const composed = { ok: true, diff: [], violations: [], takesRefs: false } as unknown as ComposeView;
const OPTIONS = new Set(['c1', 'c4']);

const failed = (): RecState => initialRecState({ recommendation: null, recommendProblem: 'The workspace budget is used up.', chosenRecipeId: null, composed: null, remainingUsd: 0 });

describe('the Recommendation screen’s state (F14)', () => {
  it('starts with nothing selected when there is no recommendation and no library pick: no made-up default', () => {
    const state = failed();
    expect(state.selection).toBeNull();
    expect(screen(state, null, OPTIONS)).toBe('failed');
  });

  it('starts on the recommendation, or on the recipe chosen from the library', () => {
    const fromRec = initialRecState({ recommendation: rec('c1'), recommendProblem: null, chosenRecipeId: null, composed: null, remainingUsd: 19 });
    expect(fromRec.selection).toEqual({ kind: 'recipe', recipeId: 'c1' });
    expect(screen(fromRec, null, OPTIONS)).toBe('proposal');
    const fromLibrary = initialRecState({ recommendation: null, recommendProblem: null, chosenRecipeId: 'c4', composed: null, remainingUsd: 19 });
    expect(fromLibrary.selection).toEqual({ kind: 'recipe', recipeId: 'c4' });
    expect(screen(fromLibrary, 'c4', OPTIONS)).toBe('proposal');
  });

  it('a recovered recommendation selects its recipe, clears the problem and takes the new remaining amount, in one step', () => {
    const next = recovered(failed(), { recommendation: rec('c1'), remainingUsd: 19 });
    expect(next.rec?.recipeId).toBe('c1');
    expect(next.problem).toBeNull();
    expect(next.selection).toEqual({ kind: 'recipe', recipeId: 'c1' });
    expect(next.remainingUsd).toBe(19);
    expect(screen(next, null, OPTIONS)).toBe('proposal');
  });

  it('a recovered recommendation keeps a recipe the person built meanwhile on screen', () => {
    const built = composedReady(failed(), { composed, remainingUsd: 18.5 });
    expect(built.selection).toEqual({ kind: 'composed' });
    expect(built.problem).not.toBeNull();
    expect(built.rec).toBeNull();
    expect(built.remainingUsd).toBe(18.5);
    // The failure panel gives way to the person's own recipe.
    expect(screen(built, null, OPTIONS)).toBe('proposal');
    const next = recovered(built, { recommendation: rec('c4'), remainingUsd: 18.5 });
    expect(next.selection).toEqual({ kind: 'composed' });
    expect(next.rec?.recipeId).toBe('c4');
  });

  it('a failed retry keeps the failure panel, with the new reason', () => {
    const next = retryFailed(failed(), 'The provider is busy. Try again in a minute.');
    expect(next.problem).toBe('The provider is busy. Try again in a minute.');
    expect(screen(next, null, OPTIONS)).toBe('failed');
  });

  it('a flip after recovery follows the newly routed recipe', () => {
    const next = rerouted(recovered(failed(), { recommendation: rec('c1'), remainingUsd: 19 }), { recommendation: rec('c4'), remainingUsd: 19 });
    expect(next.selection).toEqual({ kind: 'recipe', recipeId: 'c4' });
    expect(next.rec?.recipeId).toBe('c4');
  });

  it('a selection that is not one of the recipes is said to be unavailable, not swapped for another', () => {
    const next = selected(recovered(failed(), { recommendation: rec('c1'), remainingUsd: 19 }), { kind: 'recipe', recipeId: 'c99' });
    expect(screen(next, null, OPTIONS)).toBe('unavailable');
  });
});

describe('a composed recipe admitted again at start (ADR-0092)', () => {
  const built = () => composedReady(failed(), { composed, remainingUsd: 18.5 });
  const now = { ...composed, diff: ['Added: Defect check'], ok: false };

  it('shows what the refusal carries when the recipe now reads differently, or no longer passes', () => {
    for (const code of [COMPOSED_CHANGED, COMPOSED_REFUSED]) {
      const next = composedAfterStart(built(), { code, body: { error: 'x', code, composed: now } });
      expect(next.composed).toEqual(now);
      expect(next.selection).toEqual({ kind: 'composed' });
      expect(next.remainingUsd).toBe(18.5);
    }
  });

  it('leaves the screen as it was for any other refusal, or one without a usable view', () => {
    const before = built();
    expect(composedAfterStart(before, { code: HELD_KEY_REFUSAL, body: { composed: now } })).toBe(before);
    expect(composedAfterStart(before, { code: COMPOSED_CHANGED, body: { composed: 'no' } })).toBe(before);
    expect(composedAfterStart(before, {})).toBe(before);
  });
});

describe('a composed recipe’s refusals, each worded by what it is', () => {
  const v = (ruleId: string, message = `${ruleId} says no`) => ({ ruleId, message });
  const leads = (violations: { ruleId: string; message: string }[]) => composedRefusalGroups(violations).map((g) => [g.lead, g.items.map((i) => i.ruleId)]);

  it('protocol checks under the protocol checks; the composed profile’s are protocol checks too', () => {
    expect(leads([v('ST12'), v('COMPOSED-VOICE'), v('COMPOSED-LIMIT')])).toEqual([['It did not pass the protocol checks, so it cannot run:', ['ST12', 'COMPOSED-VOICE', 'COMPOSED-LIMIT']]]);
  });

  it('a check at Start that is not a protocol check is never listed under one (ADMIT-HASH, ADMIT-NEAREST)', () => {
    expect(leads([v('ADMIT-HASH'), v('ST12')])).toEqual([
      ['It did not pass the protocol checks, so it cannot run:', ['ST12']],
      ['It is no longer the recipe byway offered you, so it cannot run:', ['ADMIT-HASH']],
    ]);
    expect(leads([v('ADMIT-NEAREST')])).toEqual([["The recipe it was built from is no longer one of byway's, so it cannot be checked or run:", ['ADMIT-NEAREST']]]);
  });

  it('an answer byway could not read or could not check is said to be that, not a failed check', () => {
    expect(leads([v('SCHEMA'), v('FORMAT')])).toEqual([['byway could not read it as a recipe, so it cannot run:', ['SCHEMA', 'FORMAT']]]);
    expect(leads([v('COMPOSED-INTERNAL')])).toEqual([['byway could not check it, so it cannot run:', ['COMPOSED-INTERNAL']]]);
  });

  it('the notice after Build my own says the same', () => {
    expect(composeNotice({ ok: true, violations: [] })).toBe('Your recipe is ready. It is shown above.');
    expect(composeNotice({ ok: false, violations: [v('ST12')] })).toBe('byway built a recipe, but it did not pass the protocol checks. It is shown above.');
    expect(composeNotice({ ok: false, violations: [v('SCHEMA')] })).toBe('byway built a recipe, but it cannot run. It is shown above, with why.');
  });
});
