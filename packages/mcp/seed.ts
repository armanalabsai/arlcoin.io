// Writes packages/mcp/log-seed.json: the stored log scans the Agent API starts from.
//
// The Agent API reads the verified history through cachedLogsProvider, which keeps each scan in
// Cloudflare's cache. A data centre with an empty cache would have to read the whole history
// again, through an endpoint that rate-limits Workers. This script reads it once from an ordinary
// machine and writes it in the form the cache holds, so a deployment starts close to the head.
//
//   node packages/mcp/seed.ts            (before a release; commit packages/mcp/log-seed.json)
//   node packages/mcp/seed.ts <file>     (a publisher: writes the snapshot somewhere else)
//
// The file holds public on-chain events only. An out-of-date seed is still correct: the provider
// reads whatever came after it.

import { writeFileSync } from "node:fs";

import { createPublicClient, custom } from "viem";
import { base } from "viem/chains";

import { getAgentScore } from "../sdk/src/agentScore.ts";
import { cachedLogsProvider } from "./src/cachedLogs.ts";

const RPC = process.env.ARL_SEED_RPC ?? "https://base-rpc.publicnode.com";
const store = new Map<string, string>();
const client = createPublicClient({
  chain: base,
  transport: custom(
    cachedLogsProvider({
      url: RPC,
      cache: {
        match: (k) => Promise.resolve(store.get(k)),
        put: (k, v) => {
          store.set(k, v);
          return Promise.resolve();
        },
      },
    }),
    { retryCount: 2 },
  ),
});

// Any agent id: the scans do not depend on it.
await getAgentScore(client as never, 1n, { wholeRange: true });
if (store.size !== 2) throw new Error(`expected 2 scans, read ${String(store.size)}`);

// The file to write: the first argument, or the seed bundled with the deployment.
const out = process.argv[2] ?? new URL("./log-seed.json", import.meta.url);
writeFileSync(out, `${JSON.stringify(Object.fromEntries([...store].sort()), null, 2)}\n`);
for (const [key, value] of store) {
  const v = JSON.parse(value) as { from: string; to: string; logs: unknown[] };
  process.stdout.write(
    `${key.slice(0, 12)}: blocks ${v.from} to ${v.to}, ${String(v.logs.length)} logs\n`,
  );
}
