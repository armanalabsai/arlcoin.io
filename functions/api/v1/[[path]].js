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
// Log reads for the agent score, the trust graph and the audit trail go through a provider that
// keeps each scan's finished part in the Cache API and reads only the newest blocks
// (packages/mcp/src/cachedLogs.ts). Only LOG_RPC accepts 50,000-block ranges, and it rate-limits
// Cloudflare's shared addresses, so when it refuses the blocks are read from NARROW_RPC in
// 1,000-block requests (a long scan catches up over several requests), and every other call goes
// to the read endpoints.
const LOG_RPC = "https://base-rpc.publicnode.com";
const NARROW_RPC = "https://base.gateway.tenderly.co";
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
