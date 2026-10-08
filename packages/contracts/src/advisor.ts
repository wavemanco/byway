/**
 * The advisor (implemented by @byway/advisor): turns a user's problem into a recommended configuration, or a
 * composed one when none fits (ADR-0042, ADR-0058), and computes evidence labels (CR11).
 */
import type { Recipe } from '@byway/recipe';
import type { Medium } from './medium.ts';

export interface ProblemBrief {
  /** The user's own words. */
  text: string;
  /** What they want to end up with, if they said. */
  deliverable?: string;
  audience?: string;
  constraints?: string[];
  /** Pasted material (an existing draft, a diff, notes). */
  attachments?: { name: string; text: string }[];
}

/** One question of the configuration chooser (03-configurations, "Choosing a configuration"), stored as data. */
export interface ChooserQuestion {
  id: string;
  text: string;
  /** Plain-language help shown under the question. */
  help: string;
  /** Configuration id this question routes to when answered yes (the first yes decides). */
  routesTo: string;
}

export interface ChooserAnswer {
  questionId: string;
  answer: boolean;
  /** 0–1, from the intake model; 1 when the user set it. */
  confidence: number;
  rationale: string;
  setBy: 'intake' | 'user';
}

/**
 * CR11: labels are computed from the study registry, never typed. Until a study reports, every recipe is
 * "Untested". A composed recipe never inherits its blocks' labels.
 */
export interface EvidenceLabel {
  verdict: 'Supported' | 'No meaningful effect' | 'Inconclusive' | 'Worse' | 'Untested';
  scope: 'Exact' | 'Derived-from-studied' | 'Composed' | 'Experimental' | 'None';
  /** One honest sentence for the UI, e.g. "Not yet tested. Studies of this recipe are planned." */
  summary: string;
  /** Registry ids of the studies behind the label (empty when untested). */
  studies: string[];
  /** ISO date after which the label degrades to "Historical", if any. */
  expires?: string;
}

export interface CostEstimate {
  /** Low and high USD estimates for one run with the chosen profile. */
  lowUsd: number;
  highUsd: number;
  modelCalls: { low: number; high: number };
  images: { low: number; high: number };
  /** Human time the run asks for, in minutes. */
  humanMinutes: { low: number; high: number };
}

/** Plain-language presentation of a recipe for the product UI (no protocol jargon by default). */
export interface RecipePresentation {
  recipeId: string;
  /** Protocol code, shown only when "Show technical names" is on (e.g. "C1"). */
  code: string;
  name: string;
  /** One line: what it does for you. */
  promise: string;
  medium: Medium;
  bestFor: string[];
  stages: {
    stage: 'Explore' | 'Refine' | 'Finish';
    /** stepIds: the recipe step and pick ids this displayed step covers, so run events map to plain labels. */
    steps: { label: string; explainer: string; who: 'you' | 'ai' | 'tool'; stepIds: string[] }[];
  }[];
}

export interface Recommendation {
  recipeId: string;
  recipeHash: string;
  presentation: RecipePresentation;
  fit: 'strong' | 'partial' | 'none';
  /** Why this recipe, in plain words. */
  why: string;
  answers: ChooserAnswer[];
  label: EvidenceLabel;
  /** The recommender itself has not been studied (CR11). */
  routing: 'untested';
  alternatives: { recipeId: string; name: string; why: string }[];
  estimate: CostEstimate;
  /**
   * True when no chooser question was answered yes. The recommendation is then 03's fallback, C4 Reader-Ready, as a
   * partial fit, and composing a recipe is suggested alongside it.
   */
  composeSuggested: boolean;
  /** Route choices implied by the problem (e.g. { entry: 'seed' }). */
  routes: Record<string, string>;
}

export interface ComposeResult {
  recipe: Recipe;
  /** Validator verdict; a composed recipe is only offered when ok. */
  ok: boolean;
  violations: { ruleId: string; message: string }[];
  /** Nearest canonical configuration and the differences from it, in plain words. */
  nearestRecipeId: string;
  diff: string[];
  label: EvidenceLabel;
  presentation: RecipePresentation;
  estimate: CostEstimate;
}

export interface Advisor {
  questions(): ChooserQuestion[];
  /** Map the problem to chooser answers (intake model), then route deterministically. */
  recommend(problem: ProblemBrief, opts: { workspaceId: string; profileId: string; answers?: ChooserAnswer[] }): Promise<Recommendation>;
  compose(problem: ProblemBrief, opts: { workspaceId: string; profileId: string }): Promise<ComposeResult>;
  catalog(): RecipePresentation[];
  /** The canonical recipe for an id (protocol channel), for starting a run. */
  recipe(recipeId: string): Recipe | undefined;
  label(recipe: Recipe): EvidenceLabel;
  estimate(recipe: Recipe, profileId: string): CostEstimate;
}
