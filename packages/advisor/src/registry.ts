import type { EvidenceLabel } from '@byway/contracts';
import { recipeHash, type Recipe } from '@byway/recipe';

/**
 * The study registry the product reads its evidence labels from (CR11, ADR-0054). It is empty in v1: no study of a
 * product recipe has reported, so every label is computed as "Untested". Labels are never typed by hand and never
 * invented: a verdict can only come from a registry entry for the exact recipe hash a study ran.
 */

export interface StudyEntry {
  /** Registry id of the study. */
  id: string;
  /** The exact recipe the study ran (its content hash). A verdict never transfers to any other hash. */
  recipeHash: string;
  /** ISO date the study reported. */
  reported: string;
  verdict: Exclude<EvidenceLabel['verdict'], 'Untested'>;
  /** One honest sentence for the UI, written with the study's report. */
  summary: string;
  expires?: string;
}

export const STUDY_REGISTRY: readonly StudyEntry[] = [];

/**
 * What an Untested label says: only what the registry holds, which is that no study of this exact hash has reported.
 * It used to add "Studies of this recipe are planned.", a forward-looking claim nothing in the registry supports: no
 * planned study names a product recipe's hash (Paper 1 studies C1-H, its own hash), and labels are computed, never typed
 * (ADR-0054; ENG-13, LABEL-1). Should a planned study ever be registered for an exact hash, say so from that entry.
 */
export const UNTESTED_SUMMARY = 'Not yet tested.';
export const COMPOSED_SUMMARY = 'Composed for you — not tested.';

/** Composed recipes live on the workspace channel with kind 'composed' (ADR-0058); either marks one. */
export function isComposed(recipe: Recipe): boolean {
  return recipe.kind === 'composed' || recipe.channel === 'workspace';
}

/**
 * The evidence label of a recipe. A composed recipe is always "Composed" and never inherits its blocks' or its nearest
 * recipe's label (ADR-0058). Anything else carries the latest report of a study of its exact hash, or "Untested".
 */
export function labelFor(recipe: Recipe, registry: readonly StudyEntry[] = STUDY_REGISTRY): EvidenceLabel {
  if (isComposed(recipe)) return { verdict: 'Untested', scope: 'Composed', summary: COMPOSED_SUMMARY, studies: [] };
  const hash = recipeHash(recipe);
  const reports = registry.filter((e) => e.recipeHash === hash).sort((a, b) => b.reported.localeCompare(a.reported));
  const [latest] = reports;
  if (!latest) return { verdict: 'Untested', scope: 'None', summary: UNTESTED_SUMMARY, studies: [] };
  return {
    verdict: latest.verdict,
    scope: 'Exact',
    summary: latest.summary,
    studies: reports.map((e) => e.id),
    ...(latest.expires ? { expires: latest.expires } : {}),
  };
}
