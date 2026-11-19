// Cloudflare Pages Function: arlcoin.io/a2a, the ARL tools over Agent2Agent (A2A) JSON-RPC
// (packages/mcp/src/a2a.ts). Read-only: no key, no transaction is ever sent.
import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";

import { handleA2a } from "../packages/mcp/src/a2a.ts";
import { arlTools } from "../packages/mcp/src/tools.ts";

const chain = createPublicClient({
  chain: base,
  // retryCount 0: the fallback moves on to the next endpoint (see functions/api/v1).
  transport: fallback(
    ["https://base.drpc.org", "https://base-rpc.publicnode.com", "https://mainnet.base.org"].map(
      (url) => http(url, { timeout: 3000, retryCount: 0 }),
    ),
  ),
});
const tools = arlTools({ chain });

export function onRequest({ request }) {
  return handleA2a(request, tools);
}
