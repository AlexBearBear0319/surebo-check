import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Webpack from bundling Node.js-only packages that use built-in
  // modules (stream, zlib, fs, etc.). They are server-side only.
  serverExternalPackages: ["@clickhouse/client", "@clickhouse/client-common"],
};

export default nextConfig;
