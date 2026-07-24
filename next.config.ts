import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone/server.js with only the runtime
  // deps needed — the basis for a minimal Docker image (see Dockerfile).
  output: "standalone",

  // Serve the standalone gallery (public/galeria.html) at a clean /galeria URL.
  // The file is a self-contained HTML page (screenshots inlined as base64), so
  // a rewrite to the static asset is enough — no route handler or React page.
  async rewrites() {
    return [{ source: "/galeria", destination: "/galeria.html" }];
  },
};

export default nextConfig;
