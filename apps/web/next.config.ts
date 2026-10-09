import type { NextConfig } from 'next';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The build's folder inside apps/web and the tsconfig that build uses (DEV-1): `.next` normally; `.next-e2e` for the
 * e2e suite (BYWAY_NEXT_DIST_DIR), so running it never rebuilds under a byway you are running from the same checkout.
 * Next.js adds its build folder's type paths to the tsconfig it builds with, so the e2e build has its own
 * (tsconfig.e2e.json) and tsconfig.json stays as committed.
 */
const BUILDS = { '.next': 'tsconfig.json', '.next-e2e': 'tsconfig.e2e.json' } as const;

function build(env: Env): { distDir: keyof typeof BUILDS; tsconfigPath: string } {
  const dir = env.BYWAY_NEXT_DIST_DIR?.trim() || '.next';
  if (!Object.hasOwn(BUILDS, dir)) throw new Error(`BYWAY_NEXT_DIST_DIR must be .next or .next-e2e, not "${dir}".`);
  const distDir = dir as keyof typeof BUILDS;
  return { distDir, tsconfigPath: BUILDS[distDir] };
}

export function configFor(env: Env): NextConfig {
  const { distDir, tsconfigPath } = build(env);
  return {
    distDir,
    // Shared by client and server code (types, media, recipe shapes): compiled into the app's bundles.
    transpilePackages: ['@byway/contracts', '@byway/protocol', '@byway/recipe', '@byway/canonical'],
    // The engine packages (@byway/store, gateway, prompts, advisor, catalog and the runner's client entry) are not
    // bundled: src/services/engine.ts imports them at run time and Node loads them itself. These are their third-party
    // dependencies, kept external should anything reach them through the bundle.
    serverExternalPackages: ['@temporalio/client', '@anthropic-ai/sdk', 'openai', '@google/genai', '@fal-ai/client'],
    poweredByHeader: false,
    // `next dev` would otherwise write AGENTS.md and CLAUDE.md into the app. Agent instructions for this repo
    // are a decision for its maintainers, not a side effect of starting the dev server.
    agentRules: false,
    // `pnpm start` builds every time it starts; type checking is `pnpm typecheck`'s job (and CI's), not a reason for
    // byway not to start.
    typescript: { ignoreBuildErrors: true, tsconfigPath },
    experimental: {
      // Turbopack's persistent cache keeps a snapshot of the process environment, provider keys included, under
      // apps/web/.next (SEC-3). `next dev` needs the keys (it recommends and composes), so its cache is off.
      // scripts/serve.ts gives `next build` no keys, but a build run by hand has whatever the shell has, so that
      // cache is off too (the build takes seconds without it).
      turbopackFileSystemCacheForDev: false,
      turbopackFileSystemCacheForBuild: false,
    },
    async headers() {
      return [
        {
          // The app's own screens may not be framed by anything (clickjacking). Both artifact routes, /artifacts and
          // /api/artifacts, set their own, stricter headers (src/server/artifacts.ts). They must stay out of this rule:
          // config headers replace a route's own, and a generated page served without its sandbox CSP runs as byway.
          source: '/((?!artifacts/|api/artifacts/).*)',
          headers: [
            // Images and media only from byway itself (SEC-4): an image from elsewhere in generated text would be
            // fetched as soon as it is shown, with whatever a model put in its address. Frames show only byway's own
            // addresses (F05): a click on a link in a generated page, or a page with scripts navigating itself, would
            // otherwise carry the frame, and whatever its address holds, to another site. A second layer, not consent:
            // a page running its scripts has ways out that CSP does not govern, so scripts stay a per-page choice.
            {
              key: 'Content-Security-Policy',
              value: "frame-ancestors 'none'; frame-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; img-src 'self' data: blob:; media-src 'self' data: blob:",
            },
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'Referrer-Policy', value: 'same-origin' },
          ],
        },
      ];
    },
  };
}

export default configFor(process.env);
