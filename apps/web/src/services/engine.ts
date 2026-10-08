/**
 * The engine packages, loaded by Node at run time instead of bundled into the app. Turbopack bundles workspace packages
 * as app source (they resolve to their real paths outside node_modules, so `serverExternalPackages` does not apply to
 * them), and bundling breaks them: @byway/prompts reads its templates next to its own source, @byway/store needs
 * node:sqlite, and the runner's Temporal client carries gRPC. Imports the bundler is told to leave alone resolve from the
 * server build inside apps/web to apps/web/node_modules/@byway/*, and Node strips their TypeScript itself (Node 24).
 *
 * Only types are imported statically here; the values come from {@link loadEngine}.
 */
import type * as Advisor from '@byway/advisor';
import type * as Catalog from '@byway/catalog';
import type * as Gateway from '@byway/gateway';
import type * as Prompts from '@byway/prompts';
import type * as RunnerClient from '@byway/runner/client';
import type * as Store from '@byway/store';

export interface EngineModules {
  advisor: typeof Advisor;
  catalog: typeof Catalog;
  gateway: typeof Gateway;
  prompts: typeof Prompts;
  /** The runner's client entry only: never the worker, the dev engine, esbuild or Playwright. */
  runner: typeof RunnerClient;
  store: typeof Store;
}

export async function loadEngine(): Promise<EngineModules> {
  const [advisor, catalog, gateway, prompts, runner, store] = await Promise.all([
    import(/* turbopackIgnore: true */ /* webpackIgnore: true */ '@byway/advisor'),
    import(/* turbopackIgnore: true */ /* webpackIgnore: true */ '@byway/catalog'),
    import(/* turbopackIgnore: true */ /* webpackIgnore: true */ '@byway/gateway'),
    import(/* turbopackIgnore: true */ /* webpackIgnore: true */ '@byway/prompts'),
    import(/* turbopackIgnore: true */ /* webpackIgnore: true */ '@byway/runner/client'),
    import(/* turbopackIgnore: true */ /* webpackIgnore: true */ '@byway/store'),
  ]);
  return { advisor, catalog, gateway, prompts, runner, store };
}
