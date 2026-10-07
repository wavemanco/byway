import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@byway/contracts', '@byway/protocol', '@byway/recipe', '@byway/canonical'],
  poweredByHeader: false,
};

export default nextConfig;
