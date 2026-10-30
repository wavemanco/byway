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
  /**
   * ISO date the study's evidence expires, carried from its registry entry, if any. Nothing acts on it yet: labelFor
   * passes it through, and `verdict` has no outcome for expired evidence. Enforcing it is a prerequisite for the
   * registry's first entry (docs/backlog.md, "Before the study registry's first entry"); the registry is empty in v1.
   */
  expires?: string;
}

export interface CostEstimate {
  /** Low and high USD estimates for one run with the chosen profile. */
  lowUsd: number;
  highUsd: number;
  /** Calls to a text model; images and clips are counted on their own. */
  modelCalls: { low: number; high: number };
  images: { low: number; high: number };
  /** Video clips (relay links that make one). Absent from an estimate stored before clips were counted. */
  clips?: { low: number; high: number };
  /** Human time the run asks for, in minutes. */
  humanMinutes: { low: number; high: number };
  /**
   * The most of the budget the run holds at once, at the high end: what it has spent and what its calls in flight
   * reserve, which a fan-out's calls do together (B-148). A budget below it can stop a run that would cost less.
   * Absent from an estimate stored before it was counted, and from a question's estimate.
   */
  holdUsd?: number;
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
    /**
     * stepIds: the recipe step ids and operator ids (pick, optional, route, loop, gate, relay; replicate, each and
     * audit where one displayed step covers the whole body) this displayed step covers, so every run event maps to a
     * plain label. Each id appears in exactly one displayed step.
     */
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
  /**
   * `routes`: route choices from an earlier recommendation, kept when the answers are complete and no intake call is
   * made (re-routing after the user flips an answer).
   */
  recommend(
    problem: ProblemBrief,
    opts: { workspaceId: string; profileId: string; answers?: ChooserAnswer[]; routes?: Record<string, string> },
  ): Promise<Recommendation>;
  compose(problem: ProblemBrief, opts: { workspaceId: string; profileId: string }): Promise<ComposeResult>;
  /**
   * Admit a stored composed recipe again, before it runs (ADR-0092): the composer's checks as they are now, on the
   * stored recipe under its own id, with what the screen says about it (differences from the nearest recipe,
   * presentation, label) and its estimate computed afresh. No model call. `ok` is false when it no longer passes, or
   * when it no longer hashes to the recipe that was offered (its hash is then reported as a violation).
   */
  admit(composed: Pick<ComposeResult, 'recipe' | 'nearestRecipeId'>, opts: { problem: ProblemBrief; profileId: string }): ComposeResult;
  catalog(): RecipePresentation[];
  /** The canonical recipe for an id (protocol channel), for starting a run. */
  recipe(recipeId: string): Recipe | undefined;
  label(recipe: Recipe): EvidenceLabel;
  /** With the person's problem, each prompt that shows it is sized with it; without, at the planning size. */
  estimate(recipe: Recipe, profileId: string, problem?: ProblemBrief): CostEstimate;
}
