import * as defaultCatalog from '@byway/catalog';
import type {
  Advisor,
  ChooserAnswer,
  ChooserQuestion,
  ComposeResult,
  CostEstimate,
  EvidenceLabel,
  Gateway,
  ProblemBrief,
  ProfileStatus,
  Recommendation,
  RecipePresentation,
} from '@byway/contracts';
import { DEMO_PROFILE_ID, type PriceRow } from '@byway/gateway';
import type { PromptLibrary } from '@byway/prompts';
import { recipeHash, type Recipe } from '@byway/recipe';
import { mergeAnswers, needsIntake } from './answers.ts';
import { checkAnswer, composeRecipe, type Violation } from './compose.ts';
import { diffFromNearest } from './diff.ts';
import { AdvisorError } from './errors.ts';
import { estimateRecipe } from './estimate.ts';
import { routesFor, runIntake } from './intake.ts';
import { presentComposed } from './present.ts';
import { labelFor, STUDY_REGISTRY, type StudyEntry } from './registry.ts';
import { route, type Routed } from './routing.ts';
import { clip, oneLine } from './text.ts';
import { whyAlternative, whyRecommended } from './why.ts';

/**
 * What the advisor reads from the catalog. The names mirror @byway/catalog's exports, so the package itself can be
 * passed (`import * as catalog from '@byway/catalog'`), and tests can pass a smaller one.
 */
export interface AdvisorCatalog {
  /** The chooser's questions, in 03's order (the first yes decides). */
  CHOOSER: readonly ChooserQuestion[];
  /** Where the chooser goes when nothing is a yes (03: C4). */
  CHOOSER_FALLBACK: string;
  /** The canonical configurations, on the protocol channel. */
  PROTOCOL_CONFIGS: readonly Recipe[];
  PRESENTATIONS: readonly RecipePresentation[];
}

export interface AdvisorOptions {
  gateway: Gateway;
  /** The templates (@byway/prompts' library): rendered for the advisor's own calls, and read by the composed profile. */
  prompts: PromptLibrary;
  /** Defaults to @byway/catalog. */
  catalog?: AdvisorCatalog;
  /** The study registry labels are computed from (empty in v1). */
  registry?: readonly StudyEntry[];
  /** The price table estimates use; defaults to the gateway package's (the table the gateway itself charges by). */
  prices?: readonly PriceRow[];
  now?: () => Date;
  /** Fresh ids for composed recipes (tests make them predictable). */
  newId?: () => string;
}

interface Decided {
  routed: Routed;
  answers: ChooserAnswer[];
  /** Route choices from the intake, or kept from the caller when no intake ran (not yet narrowed to a recipe). */
  routes: Record<string, string>;
}

interface DecideOptions {
  workspaceId: string;
  profileId: string;
  answers?: ChooserAnswer[];
  routes?: Record<string, string>;
}

export function createAdvisor(opts: AdvisorOptions): Advisor {
  const catalog = opts.catalog ?? defaultCatalog;
  const registry = opts.registry ?? STUDY_REGISTRY;
  const now = opts.now ?? (() => new Date());
  const questions = [...catalog.CHOOSER];

  const recipe = (id: string): Recipe | undefined => catalog.PROTOCOL_CONFIGS.find((r) => r.id === id && r.channel === 'protocol');
  const presentationOf = (id: string) => catalog.PRESENTATIONS.find((p) => p.recipeId === id);
  const canonical = (id: string): { recipe: Recipe; presentation: RecipePresentation } => {
    const r = recipe(id);
    const p = presentationOf(id);
    if (!r || !p) throw new AdvisorError('unknown-recipe', `The chooser points to "${id}", which is not a configuration in the catalog.`);
    return { recipe: r, presentation: p };
  };

  const label = (r: Recipe): EvidenceLabel => labelFor(r, registry);

  /**
   * Estimates price the profile the run will actually use. In demo mode (Gateway.demo) every call goes to the mock,
   * so that is the demo profile, whatever profile is asked for: a demo estimate reads $0, and its images and clips are
   * the mock's. A profile the gateway does not know is still refused, as the gateway refuses it in demo mode too.
   */
  const statusFor = (profileId: string): ProfileStatus => {
    const statuses = opts.gateway.profileStatus();
    if (!statuses.some((s) => s.profile.id === profileId)) throw new AdvisorError('unknown-profile', `There is no model profile "${profileId}".`);
    const priced = opts.gateway.demo ? DEMO_PROFILE_ID : profileId;
    const status = statuses.find((s) => s.profile.id === priced);
    if (!status) throw new AdvisorError('unknown-profile', `Demo mode is on, but the gateway has no "${priced}" profile to estimate with.`);
    return status;
  };
  const estimate = (r: Recipe, profileId: string): CostEstimate => {
    const status = statusFor(profileId);
    return estimateRecipe(r, { profile: status.profile, images: status.images, video: status.video, otherFamily: status.otherFamily, at: now(), ...(opts.prices ? { prices: opts.prices } : {}) });
  };

  /**
   * Intake (only when some question has no answer yet), merge, then deterministic routing. Route choices are the fresh
   * intake's when it ran; otherwise the caller's from an earlier recommendation are kept (contract: re-routing after
   * the user flips an answer makes no model call and keeps what was chosen).
   */
  /**
   * What the screen is told about a composed recipe and what it costs, around the checks' outcome: shared by compose
   * and by admit, so a recipe admitted again at start is explained exactly as compose would explain it now. Its image
   * and motion steps are explained for the profile it is estimated for, as the runner reads it (mediaStatus).
   */
  function composedResult(composed: Recipe, nearest: { recipe: Recipe; presentation: RecipePresentation }, problem: ProblemBrief, profileId: string, ok: boolean, violations: readonly Violation[]): ComposeResult {
    const { images, video } = statusFor(profileId);
    const presentation = presentComposed(
      composed,
      {
        code: `${composed.family} (composed)`,
        name: `Your recipe, built from ${nearest.presentation.name}`,
        promise: `Built for your problem from the protocol's blocks, starting from ${nearest.presentation.name}. Not tested.`,
        bestFor: [clip(oneLine(problem.text), 80)],
      },
      { images, video },
    );
    return {
      recipe: composed,
      ok,
      violations: violations.map((v) => ({ ruleId: v.ruleId, message: v.path ? `${v.path}: ${v.message}` : v.message })),
      nearestRecipeId: nearest.recipe.id,
      diff: diffFromNearest(composed, nearest.recipe, nearest.presentation.name, nearest.presentation),
      label: label(composed),
      presentation,
      estimate: estimate(composed, profileId),
    };
  }

  async function decide(problem: ProblemBrief, o: DecideOptions): Promise<Decided> {
    const intake = needsIntake(questions, o.answers) ? await runIntake({ gateway: opts.gateway, prompts: opts.prompts, questions }, problem, o) : undefined;
    const answers = mergeAnswers(questions, intake?.answers, o.answers);
    return { routed: route(questions, answers, catalog.CHOOSER_FALLBACK), answers, routes: intake ? intake.routes : (o.routes ?? {}) };
  }

  return {
    questions: () => questions.map((q) => ({ ...q })),

    catalog: () => [...catalog.PRESENTATIONS],

    recipe,

    label,

    estimate,

    async recommend(problem, o): Promise<Recommendation> {
      const { routed, answers, routes } = await decide(problem, o);
      const { recipe: chosen, presentation } = canonical(routed.recipeId);
      return {
        recipeId: chosen.id,
        recipeHash: chosen.hash ?? recipeHash(chosen),
        presentation,
        fit: routed.fit,
        why: whyRecommended(routed, presentation),
        answers,
        label: label(chosen),
        routing: 'untested',
        alternatives: routed.alternatives.map((a) => ({ recipeId: a.question.routesTo, name: presentationOf(a.question.routesTo)?.name ?? a.question.routesTo, why: whyAlternative(a) })),
        estimate: estimate(chosen, o.profileId),
        composeSuggested: routed.fallback,
        routes: routesFor(chosen, routes),
      };
    },

    async compose(problem, o): Promise<ComposeResult> {
      const { routed } = await decide(problem, o);
      const nearest = canonical(routed.recipeId);
      const outcome = await composeRecipe(
        { gateway: opts.gateway, prompts: opts.prompts, catalog: catalog.PROTOCOL_CONFIGS, ...(opts.newId ? { newId: opts.newId } : {}) },
        problem,
        nearest.recipe,
        o,
      );
      if (!outcome.recipe) {
        const why = outcome.violations.map((v) => v.message).join('; ');
        throw new AdvisorError('compose-unreadable', `The composer did not return a recipe that could be read: ${why}.`);
      }
      return composedResult(outcome.recipe, nearest, problem, o.profileId, outcome.ok, outcome.violations);
    },

    admit(stored, o): ComposeResult {
      const nearest = canonical(stored.nearestRecipeId);
      // The same checks compose ran, under the stored id, so an unchanged recipe hashes exactly as it did when offered.
      const { hash: _hash, ...raw } = stored.recipe;
      const candidate = checkAnswer(JSON.stringify(raw), nearest.recipe, { prompts: opts.prompts, catalog: catalog.PROTOCOL_CONFIGS }, stored.recipe.id);
      const recipe = candidate.recipe ?? stored.recipe;
      const violations: Violation[] = [...candidate.violations];
      if (candidate.recipe && candidate.recipe.hash !== stored.recipe.hash) {
        violations.push({ ruleId: 'ADMIT-HASH', message: 'the recipe no longer reads as the one byway offered (its content hash changed), so it is not the recipe you were shown' });
      }
      return composedResult(recipe, nearest, o.problem, o.profileId, violations.length === 0, violations);
    },
  };
}
