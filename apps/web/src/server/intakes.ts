/**
 * Intakes hold a problem between the Start screen and the start of a run (recommendation, flipped answers,
 * a composed recipe). The contracts have no record for this, so it lives in server memory: losing one on
 * restart only means typing the problem again. Runs started from a composed recipe remember its presentation
 * here too, because the catalog does not know composed recipes.
 */
import { randomUUID } from 'node:crypto';
import type { ComposeResult, EvidenceLabel, ProblemBrief, RecipePresentation } from '@byway/contracts';

/** How a run's recipe is shown when the catalog does not know it (a composed recipe). */
export interface RunRecipe {
  presentation: RecipePresentation;
  /** The label the advisor computed when it composed the recipe (CR11: never typed). */
  label: EvidenceLabel;
}

export interface Intake {
  id: string;
  problem: ProblemBrief;
  /** Set when the person chose a recipe from the library instead of asking for a recommendation. */
  recipeId?: string;
  composed?: ComposeResult;
  createdAt: string;
}

export interface IntakeStore {
  create(input: { problem: ProblemBrief; recipeId?: string }): Intake;
  get(id: string): Intake | undefined;
  setComposed(id: string, result: ComposeResult): void;
  rememberRun(runId: string, recipe: RunRecipe): void;
  runRecipe(runId: string): RunRecipe | undefined;
}

export function createIntakeStore(limit = 100): IntakeStore {
  const intakes = new Map<string, Intake>();
  const runs = new Map<string, RunRecipe>();
  const trim = <K, V>(map: Map<K, V>) => {
    while (map.size > limit) {
      const oldest = map.keys().next().value as K;
      map.delete(oldest);
    }
  };
  return {
    create(input) {
      const intake: Intake = { id: randomUUID(), problem: input.problem, createdAt: new Date().toISOString(), ...(input.recipeId ? { recipeId: input.recipeId } : {}) };
      intakes.set(intake.id, intake);
      trim(intakes);
      return intake;
    },
    get: (id) => intakes.get(id),
    setComposed(id, result) {
      const intake = intakes.get(id);
      if (intake) intakes.set(id, { ...intake, composed: result });
    },
    rememberRun(runId, recipe) {
      runs.set(runId, recipe);
      trim(runs);
    },
    runRecipe: (runId) => runs.get(runId),
  };
}

const KEY = Symbol.for('byway.intakes');

/** One store per server process (see getServices for why it lives on globalThis). */
export function getIntakes(): IntakeStore {
  const holder = globalThis as { [KEY]?: IntakeStore };
  holder[KEY] ??= createIntakeStore();
  return holder[KEY];
}
