/**
 * The only way screens and route handlers reach data (spec §5; WP-F brief). In this phase every service is
 * a demo fake; Phase 3 swaps in @byway/advisor, @byway/runner, @byway/store and @byway/gateway here, behind
 * the same `Services` shape, and nothing else in the app changes.
 */
import { createDemoServices } from './demo/index.ts';
import type { Services } from './types.ts';

export type { PreferenceStore, Preferences, RecipeSource, RunControls, Services } from './types.ts';

const KEY = Symbol.for('byway.services');

type Holder = { [KEY]?: Services };

/**
 * One instance per server process. Next.js compiles route handlers and pages into separate bundles, and
 * hot reload re-evaluates modules, so the instance lives on globalThis rather than in module scope.
 */
export function getServices(): Services {
  const holder = globalThis as Holder;
  holder[KEY] ??= createDemoServices();
  return holder[KEY];
}

/** The default workspace and the chosen model profile, which most requests need. */
export async function getContext(): Promise<{ services: Services; workspaceId: string; profileId: string }> {
  const services = getServices();
  const workspace = await services.store.ensureDefaultWorkspace();
  return { services, workspaceId: workspace.id, profileId: services.preferences.get().profileId };
}
