import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@byway/contracts', '@byway/protocol', '@byway/recipe', '@byway/canonical'],
  poweredByHeader: false,
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
