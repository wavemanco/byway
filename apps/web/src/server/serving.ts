/**
 * Rules for how scripts/serve.ts runs the web app (C8: `pnpm start`, `pnpm demo`, `pnpm dev`), as plain functions so
 * they are tested without starting anything. Node-only and never imported by the app. Which environment `next build`
 * gets (no key, SEC-3) is the gateway's one rule for every child that must hold none: withoutSecrets in @byway/gateway.
 */

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
