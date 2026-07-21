import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone/server.js with only the runtime
  // deps needed — the basis for a minimal Docker image (see Dockerfile).
  output: "standalone",
};

export default nextConfig;
