/**
 * Rules for how scripts/serve.ts runs the web app (C8: `pnpm start`, `pnpm demo`, `pnpm dev`), as plain functions so
 * they are tested without starting anything. Node-only and never imported by the app.
 */

/**
 * Environment variables that hold secrets. `next build` is given none of them (SEC-3): the build needs no key, and
 * Turbopack's persistent cache would otherwise keep a snapshot of the environment under the repo. Provider keys are
 * named exactly; anything else secret-looking is dropped too, as a second line.
 */
const SECRET_NAME = /(?:API_KEY|_KEY|_TOKEN|_SECRET|PASSWORD)$/i;

export function withoutSecrets(env: Readonly<Record<string, string | undefined>>, keyVars: readonly string[]): Record<string, string> {
  const named = new Set(keyVars.map((k) => k.toUpperCase()));
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || named.has(name.toUpperCase()) || SECRET_NAME.test(name)) continue;
    out[name] = value;
  }
  return out;
}

export type ServeMode = 'start' | 'dev';

export interface ServeArgs {
  mode: ServeMode;
  demo: boolean;
}

/** `serve.ts [start|dev] [--demo]`; BYWAY_DEMO=1 also forces the mock. Start is the default. */
export function parseServeArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): ServeArgs {
  const flagOn = (v: string | undefined) => ['1', 'true'].includes(v?.trim().toLowerCase() ?? '');
  return { mode: argv.includes('dev') ? 'dev' : 'start', demo: argv.includes('--demo') || flagOn(env.BYWAY_DEMO) };
}
