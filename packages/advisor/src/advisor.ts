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
  PromptRenderer,
  Recommendation,
  RecipePresentation,
} from '@byway/contracts';
import type { PriceRow } from '@byway/gateway';
import { recipeHash, type Recipe } from '@byway/recipe';
import { mergeAnswers, needsIntake } from './answers.ts';
import { composeRecipe } from './compose.ts';
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
  prompts: PromptRenderer;
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
  /** Route choices the intake proposed (not yet narrowed to a recipe). */
  routes: Record<string, string>;
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

  const estimate = (r: Recipe, profileId: string): CostEstimate => {
    const status = opts.gateway.profileStatus().find((s) => s.profile.id === profileId);
    if (!status) throw new AdvisorError('unknown-profile', `There is no model profile "${profileId}".`);
    return estimateRecipe(r, { profile: status.profile, images: status.images, video: status.video, at: now(), ...(opts.prices ? { prices: opts.prices } : {}) });
  };

  /** Intake (only when some question has no answer yet), merge, then deterministic routing. */
  async function decide(problem: ProblemBrief, o: { workspaceId: string; profileId: string; answers?: ChooserAnswer[] }): Promise<Decided> {
    const intake = needsIntake(questions, o.answers) ? await runIntake({ gateway: opts.gateway, prompts: opts.prompts, questions }, problem, o) : undefined;
    const answers = mergeAnswers(questions, intake?.answers, o.answers);
    return { routed: route(questions, answers, catalog.CHOOSER_FALLBACK), answers, routes: intake?.routes ?? {} };
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
      const composed = outcome.recipe;
      const presentation = presentComposed(composed, {
        code: `${composed.family} (composed)`,
        name: `Your recipe, built from ${nearest.presentation.name}`,
        promise: `Built for your problem from the protocol's blocks, starting from ${nearest.presentation.name}. Not tested.`,
        bestFor: [clip(oneLine(problem.text), 80)],
      });
      return {
        recipe: composed,
        ok: outcome.ok,
        violations: outcome.violations.map((v) => ({ ruleId: v.ruleId, message: v.path ? `${v.path}: ${v.message}` : v.message })),
        nearestRecipeId: nearest.recipe.id,
        diff: diffFromNearest(composed, nearest.recipe, nearest.presentation.name),
        label: label(composed),
        presentation,
        estimate: estimate(composed, o.profileId),
      };
    },
  };
}
