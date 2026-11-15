// Cloudflare Pages Function: arlcoin.io/api/v1/* (Agent API v1). The routes and the rule live in
// packages/mcp/src/http.ts; they are the MCP server's tools over HTTP. Read-only: no key, no
// transaction is ever sent.
import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";

import { handleHttp } from "../../../packages/mcp/src/http.ts";
import { arlTools } from "../../../packages/mcp/src/tools.ts";

// Public Base endpoints, tried in order (mainnet.base.org refuses some Worker requests).
const chain = createPublicClient({
  chain: base,
  transport: fallback([
    http("https://base-rpc.publicnode.com", { timeout: 4000 }),
    http("https://base.drpc.org", { timeout: 4000 }),
    http("https://mainnet.base.org", { timeout: 4000 }),
  ]),
});
const tools = arlTools({ chain });

export function onRequest({ request }) {
  return handleHttp(request, tools);
}
