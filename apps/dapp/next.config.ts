import path from "node:path";
import type { NextConfig } from "next";

// The app uses @arl/zk from packages/zk, outside this directory, so Turbopack resolves from the
// repository root (as the website does for packages/tokenomics).
const repoRoot = path.join(import.meta.dirname, "..", "..");

// wagmi's Base Account connector (via RainbowKit) imports @base-org/account, whose Node entry
// adds server-side payment helpers built on @coinbase/cdp-sdk and its optional x402 peers. The app
// only uses the connector in the browser, so the server render resolves the browser entry too.
const BASE_ACCOUNT_BROWSER = "./node_modules/@base-org/account/dist/index.js";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
    resolveAlias: { "@base-org/account": BASE_ACCOUNT_BROWSER },
  },
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
