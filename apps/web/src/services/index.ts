/**
 * The only way screens and route handlers reach data (spec §5; WP-F brief). In this phase every service is
 * a demo fake; Phase 3 swaps in @byway/advisor, @byway/runner, @byway/store and @byway/gateway here, behind
 * the same `Services` shape, and nothing else in the app changes.
 */
import type { Preferences } from '@byway/contracts';
import { connection } from 'next/server';
import { createDemoServices } from './demo/index.ts';
import type { Services } from './types.ts';

export type { Services } from './types.ts';

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

export interface Context {
  services: Services;
  workspaceId: string;
  /** The model profile runs use, from Settings. */
  profileId: string;
  preferences: Preferences;
}

/**
 * The default workspace and its preferences (Store.getPreferences), which most requests need. Reading them waits
 * for a request (`connection()`), so no screen that shows workspace data is ever prerendered at build time.
 */
export async function getContext(): Promise<Context> {
  await connection();
  const services = getServices();
  const workspace = await services.store.ensureDefaultWorkspace();
  const preferences = await services.store.getPreferences(workspace.id);
  return { services, workspaceId: workspace.id, profileId: preferences.profileId, preferences };
}
