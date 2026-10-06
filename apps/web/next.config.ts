import path from "node:path";
import type { NextConfig } from "next";

// The site reads tokenomics from packages/tokenomics (the repository's single
// source of truth), which sits outside this app. Turbopack and output file
// tracing must therefore resolve from the repository root.
const repoRoot = path.join(import.meta.dirname, "..", "..");

// ARL_STATIC_EXPORT=1 builds a static site into `out/` for GitHub Pages
// (.github/workflows/pages.yml). Static hosting cannot send response headers, so the header
// block below applies only to server hosting; the referrer policy is also set in a meta tag.
const staticExport = process.env.ARL_STATIC_EXPORT === "1";
// Sub-path the static site is served under: empty on the custom domain, "/ARLCOIN" on the
// project URL (gokturkalazdaghan-dot.github.io/ARLCOIN). The Pages workflow sets it.
const basePath = staticExport ? (process.env.ARL_BASE_PATH ?? "") : "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  ...(staticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
        ...(basePath ? { basePath, env: { NEXT_PUBLIC_BASE_PATH: basePath } } : {}),
      }
    : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
