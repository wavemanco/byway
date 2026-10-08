import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
  async headers() {
    return [
      {
        // The app's own screens may not be framed by anything (clickjacking). Both artifact routes, /artifacts and
        // /api/artifacts, set their own, stricter headers (src/server/artifacts.ts). They must stay out of this rule:
        // config headers replace a route's own, and a generated page served without its sandbox CSP runs as byway.
        source: '/((?!artifacts/|api/artifacts/).*)',
        headers: [
          // Images and media only from byway itself (SEC-4): an image from elsewhere in generated text would be
          // fetched as soon as it is shown, with whatever a model put in its address.
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; img-src 'self' data: blob:; media-src 'self' data: blob:",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
