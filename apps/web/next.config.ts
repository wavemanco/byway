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
        // The app's own screens may not be framed by anything (clickjacking). Generated pages under /artifacts
        // set their own, stricter headers in the artifact route and may be framed by the app only.
        source: '/((?!artifacts/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
