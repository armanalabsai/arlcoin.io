// Cloudflare Pages Function: arlcoin.io/api/v1/* (Agent API v1). The routes and the rule live in
// packages/mcp/src/http.ts; they are the MCP server's tools over HTTP. Read-only: no key, no
// transaction is ever sent.
import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";

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
const tools = arlTools({ chain });

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
