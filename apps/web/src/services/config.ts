/**
 * How the web process finds its services (spec §2 process model): the data directory, whether `pnpm demo` forced the
 * mock, the Temporal engine's address and the repo's `.env.agents`. Plain functions over an environment, so the rules
 * are tested without starting anything.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_TEMPORAL_ADDRESS, type ProfileStatus } from '@byway/contracts';

export type Env = Readonly<Record<string, string | undefined>>;

/** The gateway's demo profile (@byway/gateway DEMO_PROFILE_ID; a test keeps them equal). */
export const DEMO_PROFILE_ID = 'demo';

/** The keys file at the repo root (ADR-0009: gitignored, never committed). */
export const ENV_FILE = '.env.agents';

export interface ServicesConfig {
  /** BYWAY_DATA_DIR, else the platform default; never inside OneDrive or a git working tree. */
  dataDir: string;
  /** `pnpm demo` sets BYWAY_DEMO=1: the mock answers every call whatever Settings say. */
  demo: boolean;
  /** BYWAY_TEMPORAL_ADDRESS, set by the dev script to the engine it started. */
  temporalAddress: string;
  /** `.env.agents` at the repo root, when the app runs inside the repo. */
  envFile?: string;
}

/** Whether an environment flag is on: "1" or "true" (any case), as the scripts set it. */
export function flagOn(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === '1' || v === 'true';
}

/** The nearest folder at or above `start` holding `pnpm-workspace.yaml`: the repo root. */
export function findRepoRoot(start: string): string | undefined {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    if (path.dirname(dir) === dir) return undefined;
  }
}

/** `resolveDataDir` is @byway/store's, passed in because the engine packages load at run time (engine.ts). */
export function servicesConfig(env: Env, cwd: string, resolveDataDir: (opts: { env: Env }) => string): ServicesConfig {
  const root = findRepoRoot(cwd);
  return {
    dataDir: resolveDataDir({ env }),
    demo: flagOn(env.BYWAY_DEMO),
    temporalAddress: env.BYWAY_TEMPORAL_ADDRESS?.trim() || DEFAULT_TEMPORAL_ADDRESS,
    ...(root ? { envFile: path.join(root, ENV_FILE) } : {}),
  };
}

/** True when some real (non-demo) profile has keys for its text tiers. */
export function liveUsable(statuses: readonly ProfileStatus[]): boolean {
  return statuses.some((s) => s.usable && s.profile.id !== DEMO_PROFILE_ID);
}

/**
 * Demo mode (spec §5): forced by `pnpm demo`, switched on in Settings, or the only option because no provider key is
 * set. In demo mode the mock provider answers every call and nothing is charged.
 */
export function effectiveMode(opts: { forced: boolean; preference: boolean; statuses: readonly ProfileStatus[] }): 'demo' | 'live' {
  return opts.forced || opts.preference || !liveUsable(opts.statuses) ? 'demo' : 'live';
}

/**
 * The profile runs and estimates use. Demo mode always uses the demo profile, so a run started in demo mode stays on
 * the mock in the worker too. Live mode uses your chosen profile, or the first usable one when its keys are missing.
 */
export function runProfileId(mode: 'demo' | 'live', preferred: string, statuses: readonly ProfileStatus[]): string {
  if (mode === 'demo') return DEMO_PROFILE_ID;
  if (statuses.some((s) => s.profile.id === preferred && s.usable)) return preferred;
  return statuses.find((s) => s.usable && s.profile.id !== DEMO_PROFILE_ID)?.profile.id ?? DEMO_PROFILE_ID;
}
