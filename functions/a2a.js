// Cloudflare Pages Function: arlcoin.io/a2a, the ARL tools over Agent2Agent (A2A) JSON-RPC
// (packages/mcp/src/a2a.ts). Read-only: no key, no transaction is ever sent.
import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";

import { handleA2a } from "../packages/mcp/src/a2a.ts";
import { arlTools } from "../packages/mcp/src/tools.ts";

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
  return handleA2a(request, tools);
}
