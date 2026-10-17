import path from "node:path";
import type { NextConfig } from "next";

// The app uses @arl/zk from packages/zk, outside this directory, so Turbopack resolves from the
// repository root (as the website does for packages/tokenomics).
const repoRoot = path.join(import.meta.dirname, "..", "..");

// wagmi's Base Account connector (via RainbowKit) imports @base-org/account, whose Node entry
// adds server-side payment helpers built on @coinbase/cdp-sdk and its optional x402 peers. The app
// only uses the connector in the browser, so the server render resolves the browser entry too.
const BASE_ACCOUNT_BROWSER = "./node_modules/@base-org/account/dist/index.js";

// ARL_STATIC_EXPORT=1 builds a static copy into `out/` that the Pages workflow publishes under
// `/app` next to the website, so a deployment can be signed from a phone wallet's browser. Static
// hosting cannot send response headers: the header block below applies only to server hosting,
// and the deploy screen refuses to run inside a frame instead.
const staticExport = process.env.ARL_STATIC_EXPORT === "1";
const basePath = staticExport ? (process.env.ARL_BASE_PATH ?? "") : "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Route handlers are named route.api.ts: server hosting includes them (the testnet operator,
  // app/api), the static export, which cannot serve them, leaves them out.
  pageExtensions: staticExport ? ["tsx", "ts"] : ["tsx", "ts", "api.ts"],
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
    resolveAlias: { "@base-org/account": BASE_ACCOUNT_BROWSER },
  },
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
          // The same policy the website gives the app's static copy under /app
          // (apps/web/vercel.json): no source lists, since the app talks to RPC nodes and wallets.
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          // Wallets open popups (Coinbase smart wallet); a same-origin opener policy would cut them off.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
};

export default nextConfig;
