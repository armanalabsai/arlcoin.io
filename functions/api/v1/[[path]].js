// Cloudflare Pages Function: arlcoin.io/api/v1/* (Agent API v1). The routes and the rule live in
// packages/mcp/src/http.ts; they are the MCP server's tools over HTTP. Read-only: no key, no
// transaction is ever sent.
import { createPublicClient, custom, fallback, http } from "viem";
import { base } from "viem/chains";

import logSeed from "../../../packages/mcp/log-seed.json";
import { cachedLogsProvider } from "../../../packages/mcp/src/cachedLogs.ts";
import { handleHttp } from "../../../packages/mcp/src/http.ts";
import { arlTools } from "../../../packages/mcp/src/tools.ts";

// Public Base endpoints, tried in order. retryCount is 0 because the fallback already moves on to
// the next endpoint: retrying one that refuses Worker requests cost every read seconds.
const RPCS = [
  "https://base.drpc.org",
  "https://base-rpc.publicnode.com",
  "https://mainnet.base.org",
];
const chain = createPublicClient({
  chain: base,
  transport: fallback(RPCS.map((url) => http(url, { timeout: 3000, retryCount: 0 }))),
});
// The verified history (agent score, passport, trust graph, audit trail, validators) is read
// through a provider that holds each log scan as one stored entry (packages/mcp/src/cachedLogs.ts).
// Public endpoints refuse most log requests that come from Cloudflare, so the scans come from
// outside: the seed bundled with this deployment, and a snapshot the "History snapshot" workflow
// publishes every ten minutes. The provider presents the chain as of the block the scans reach, so
// every answer is a few minutes behind the head and names the block it was read at. LOG_RPC and
// NARROW_RPC remain for a range the stored scans do not cover.
const LOG_RPC = "https://base-rpc.publicnode.com";
const NARROW_RPC = "https://base.gateway.tenderly.co";
const SNAPSHOT_URL =
  "https://github.com/armanalabsai/arlcoin.io/releases/download/history-snapshot/log-seed.json";
const logCache = {
  async match(key) {
    const hit = await caches.default.match(`https://arl-log-cache.invalid/v3/${key}`);
    return hit ? hit.text() : undefined;
  },
  put(key, value) {
    return caches.default.put(
      `https://arl-log-cache.invalid/v3/${key}`,
      new Response(value, { headers: { "cache-control": "public, max-age=31536000, immutable" } }),
    );
  },
};
const logReader = createPublicClient({
  chain: base,
  transport: custom(
    cachedLogsProvider({
      url: LOG_RPC,
      // 20 requests per scan and two scans per answer stay inside a Worker's 50 subrequests.
      narrow: { url: NARROW_RPC, maxSpan: 1000n, maxRequests: 20 },
      readUrls: ["https://mainnet.base.org", "https://base.drpc.org", LOG_RPC],
      cache: logCache,
      // Where a data centre with an empty cache starts (packages/mcp/seed.ts).
      seed: logSeed,
      snapshot: async () => {
        const res = await fetch(SNAPSHOT_URL, { cf: { cacheTtl: 120, cacheEverything: true } });
        return res.ok ? res.json() : undefined;
      },
      pinned: true,
    }),
    { retryCount: 0 },
  ),
});
const tools = arlTools({ chain, logReader, wholeRangeLogs: true });

/** GET /api/v1/health: how each endpoint answers from here, for the uptime monitor. */
async function health() {
  const rpcs = await Promise.all(
    RPCS.map(async (url) => {
      const started = Date.now();
      try {
        const client = createPublicClient({
          chain: base,
          transport: http(url, { timeout: 3000, retryCount: 0 }),
        });
        const block = await client.getBlockNumber({ cacheTime: 0 });
        return {
          host: new URL(url).host,
          ok: true,
          ms: Date.now() - started,
          block: String(block),
        };
      } catch {
        return { host: new URL(url).host, ok: false, ms: Date.now() - started };
      }
    }),
  );
  const ok = rpcs.some((r) => r.ok);
  return new Response(JSON.stringify({ ok, rpcs }, null, 2), {
    status: ok ? 200 : 503,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function onRequest({ request }) {
  if (
    request.method === "GET" &&
    new URL(request.url).pathname.replace(/\/$/, "") === "/api/v1/health"
  ) {
    return health();
  }
  return handleHttp(request, tools);
}
