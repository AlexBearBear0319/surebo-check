import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Webpack from bundling Node.js-only packages that use built-in
  // modules (stream, zlib, fs, etc.). They are server-side only.
  serverExternalPackages: ["@clickhouse/client", "@clickhouse/client-common"],
  // ESLint 8/9 version mismatch causes a noisy but non-fatal warning during
  // Vercel builds. Linting is still run locally via `npm run lint`.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
