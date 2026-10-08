/**
 * The only way screens and route handlers reach data (spec §5; WP-F brief): `{ advisor, runner, store, gateway, mode }`,
 * the four @byway/contracts interfaces backed by the real packages (src/services/create.ts). Server-only: the gateway
 * reads provider keys from the environment, and nothing that holds it may reach a client bundle.
 */
import 'server-only';
import type { Preferences } from '@byway/contracts';
import { connection } from 'next/server';
import { runProfileId, servicesConfig } from './config.ts';
import { createServiceHost, type ServiceHost } from './create.ts';
import { loadEngine } from './engine.ts';
import type { Services } from './types.ts';

export type { Services } from './types.ts';

const KEY = Symbol.for('byway.services');

type Holder = { [KEY]?: Promise<ServiceHost> };

async function createHost(): Promise<ServiceHost> {
  const engine = await loadEngine();
  const config = servicesConfig(process.env, process.cwd(), engine.store.resolveDataDir);
  return createServiceHost(engine, {
    dataDir: config.dataDir,
    demo: config.demo,
    temporalAddress: config.temporalAddress,
    env: process.env,
    ...(config.envFile ? { envFile: config.envFile } : {}),
  });
}

/**
 * One set per server process. Next.js compiles route handlers and pages into separate bundles, and hot reload
 * re-evaluates modules, so the host lives on globalThis rather than in module scope: a reload must not open a second
 * database handle or a second engine connection. A host that failed to open is not kept, so the next request retries.
 */
function host(): Promise<ServiceHost> {
  const holder = globalThis as Holder;
  holder[KEY] ??= createHost().catch((err: unknown) => {
    delete holder[KEY];
    throw err;
  });
  return holder[KEY];
}

/** The services as `pnpm start` / `pnpm demo` set them up, for requests that need no workspace preferences. */
export async function getServices(): Promise<Services> {
  const h = await host();
  return h.services(h.demoForced);
}

export interface Context {
  services: Services;
  workspaceId: string;
  /** The model profile runs and estimates use: always 'demo' in demo mode, else the one chosen in Settings. */
  profileId: string;
  preferences: Preferences;
  /** Started with `pnpm demo` (BYWAY_DEMO=1): demo mode cannot be switched off in Settings. */
  demoForced: boolean;
}

/**
 * The default workspace, its preferences and the services they select: demo mode switched on in Settings forces the
 * mock just as `pnpm demo` does. Reading them waits for a request (`connection()`), so no screen that shows workspace
 * data is ever prerendered at build time.
 */
export async function getContext(): Promise<Context> {
  await connection();
  const h = await host();
  const workspace = await h.store.ensureDefaultWorkspace();
  const preferences = await h.store.getPreferences(workspace.id);
  const services = h.services(h.demoForced || preferences.demoMode);
  const profileId = runProfileId(services.mode, preferences.profileId, services.gateway.profileStatus());
  return { services, workspaceId: workspace.id, profileId, preferences, demoForced: h.demoForced };
}
