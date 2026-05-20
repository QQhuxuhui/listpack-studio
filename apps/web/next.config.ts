import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `standalone` produces .next/standalone/server.js so the Docker image
  // only needs to ship that + .next/static + public — no node_modules.
  // See apps/web/Dockerfile.
  output: 'standalone',
  experimental: {
    ppr: true,
    clientSegmentCache: true,
  },
};

export default nextConfig;
