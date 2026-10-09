/**
 * The Recommendation screen's state and the only ways it changes (F14, ADR-0082, R2).
 *
 * The screen used to copy the recommendation into component state once, invent a selection when there was none
 * (recipe 'c4'), and read whether to show the failure panel from a live prop. "Try again" refreshed the props: the
 * panel went away, the stale copy stayed, and the invented recipe was labelled "Your choice" and sent by Start.
 *
 * Now the screen owns one state, seeded once by its server render, and each command's whole result is applied by one
 * transition here. Commands return everything they change that the screen shows (the recommendation or the composed
 * recipe, and what is left in the workspace), so the screen never re-runs its server render, which asks the model while
 * no recommendation is stored. Nothing here makes up a recipe.
 */
import type { Recommendation } from '@byway/contracts';
import type { ComposeView } from '../server/api.ts';
import { COMPOSED_CHANGED, COMPOSED_REFUSED } from './refusals.ts';

export type Selection = { kind: 'recipe'; recipeId: string } | { kind: 'composed' };

export interface RecState {
  rec: Recommendation | null;
  /** Why recommending failed, in words; null once a recommendation is in. */
  problem: string | null;
  /** What the proposal shows; null when there is nothing to show (recommending failed and nothing else was chosen). */
  selection: Selection | null;
  composed: ComposeView | null;
  remainingUsd: number;
}

export interface RecSeed {
  recommendation: Recommendation | null;
  recommendProblem: string | null;
  chosenRecipeId: string | null;
  composed: ComposeView | null;
  remainingUsd: number;
}

const recipe = (recipeId: string): Selection => ({ kind: 'recipe', recipeId });

export function initialRecState(seed: RecSeed): RecState {
  const selection = seed.chosenRecipeId ? recipe(seed.chosenRecipeId) : seed.recommendation ? recipe(seed.recommendation.recipeId) : null;
  return { rec: seed.recommendation, problem: seed.recommendation ? null : seed.recommendProblem, selection, composed: seed.composed, remainingUsd: seed.remainingUsd };
}

/** Try again succeeded. A recipe the person built meanwhile stays on screen; otherwise the recommendation is shown. */
export function recovered(state: RecState, result: { recommendation: Recommendation; remainingUsd: number }): RecState {
  return {
    ...state,
    rec: result.recommendation,
    problem: null,
    selection: state.selection?.kind === 'composed' ? state.selection : recipe(result.recommendation.recipeId),
    remainingUsd: result.remainingUsd,
  };
}

/** Try again failed: the failure panel stays, with the new reason. */
export function retryFailed(state: RecState, message: string): RecState {
  return { ...state, problem: message };
}

/** A flipped chooser answer re-routed: the screen follows the newly recommended recipe. */
export function rerouted(state: RecState, result: { recommendation: Recommendation; remainingUsd: number }): RecState {
  return { ...state, rec: result.recommendation, problem: null, selection: recipe(result.recommendation.recipeId), remainingUsd: result.remainingUsd };
}

/** Build my own finished: the composed recipe is shown. The recommendation, or why it failed, is left as it was. */
export function composedReady(state: RecState, result: { composed: ComposeView; remainingUsd: number }): RecState {
  return { ...state, composed: result.composed, selection: { kind: 'composed' }, remainingUsd: result.remainingUsd };
}

/** The person chose another recipe, or went back to the recommendation or to their own. */
export function selected(state: RecState, selection: Selection): RecState {
  return { ...state, selection };
}

/**
 * What the main area shows: the failure panel only when there is nothing else to show (no recommendation, no recipe
 * from the library and nothing selected); the proposal when the selection is a recipe on offer or the composed one;
 * otherwise "not available", never a stand-in.
 */
export function screen(state: RecState, chosenRecipeId: string | null, recipes: ReadonlySet<string>): 'failed' | 'proposal' | 'unavailable' {
  const { selection } = state;
  if (!state.rec && !chosenRecipeId && !selection && state.problem !== null) return 'failed';
  if (selection?.kind === 'composed') return state.composed ? 'proposal' : 'unavailable';
  if (selection?.kind === 'recipe' && recipes.has(selection.recipeId)) return 'proposal';
  return 'unavailable';
}

/**
 * Start was refused because it admitted the composed recipe again and it now fails, or reads differently (ADR-0092):
 * the refusal carries the screen's view of the recipe as it is now, which replaces the one shown. Anything else, or a
 * refusal without a usable view, leaves the screen as it was.
 */
export function composedAfterStart(state: RecState, refusal: { code?: string | undefined; body?: Readonly<Record<string, unknown>> | undefined }): RecState {
  if (refusal.code !== COMPOSED_CHANGED && refusal.code !== COMPOSED_REFUSED) return state;
  const next = refusal.body?.composed;
  const usable = typeof next === 'object' && next !== null && Array.isArray((next as ComposeView).diff) && typeof (next as ComposeView).ok === 'boolean';
  return usable ? { ...state, composed: next as ComposeView } : state;
}
