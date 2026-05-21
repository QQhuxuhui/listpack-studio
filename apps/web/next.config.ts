import type { NextConfig } from 'next';

// PPR + clientSegmentCache are alpha features that are great in
// production but noisy in dev (Turbopack streams partials and the
// hydration matcher trips). Enable them only when building for prod.
const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  // `standalone` produces .next/standalone/server.js so the Docker image
  // only needs to ship that + .next/static + public — no node_modules.
  // See apps/web/Dockerfile.
  output: 'standalone',
  experimental: {
    ...(isProd
      ? {
          ppr: true,
          clientSegmentCache: true,
        }
      : {}),
  },
};

export default nextConfig;
