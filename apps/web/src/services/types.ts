/**
 * The services seam. Screens and route handlers reach data only through `getServices()`, which returns the
 * four contract interfaces plus a few capabilities the contracts do not define yet. Each extra is marked and
 * reported as a contract gap; Phase 3 either moves it into packages/contracts or drops it.
 */
import type { Advisor, Gateway, Runner, Store } from '@byway/contracts';
import type { Recipe } from '@byway/recipe';

/** Not in the contracts (gap): Runner has no pause/resume and RunStatus has no 'paused'. */
export interface RunControls {
  pause(runId: string): Promise<void>;
  resume(runId: string): Promise<void>;
  isPaused(runId: string): boolean;
}

/** Not in the contracts (gap): the recipe IR by id, which runner.start needs; Advisor only returns presentations. */
export interface RecipeSource {
  get(recipeId: string): Recipe | undefined;
  list(): Recipe[];
}

/** Not in the contracts (gap): Store has no place for the default model profile or the demo-mode switch. */
export interface Preferences {
  profileId: string;
  /** The person asked for sample outputs even if keys are configured. */
  demoMode: boolean;
}

export interface PreferenceStore {
  get(): Preferences;
  set(patch: Partial<Preferences>): Preferences;
}

export interface Services {
  advisor: Advisor;
  runner: Runner;
  store: Store;
  gateway: Gateway;
  recipes: RecipeSource;
  /** Null when the runner cannot pause. */
  controls: RunControls | null;
  preferences: PreferenceStore;
  /** 'demo' while the mock provider answers every call (no keys, or demo mode on). */
  mode: 'demo' | 'live';
}
