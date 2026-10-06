// Usage: node packages/deploy/src/pool-cli.ts <pools.json> <batch.json>
//
// pools.json:
//   { "token": "0x...", "liquiditySafe": "0x...", "priceUsd": "0.20",
//     "legs": [ { "quote": "USDC", "arlAmount": "200000", "quoteUsd": "1" },
//               { "quote": "WETH", "arlAmount": "150000", "quoteUsd": "<ETH price in USD>" }, ... ] }
//   "deadline" (unix seconds) is optional; the default is the TGE plus 30 days.
//
// Writes the Liquidity Safe's launch-liquidity batch (Uniswap v3, 1%, one ARL-only pool per
// quote token, from the listing price up) in the Safe Transaction Builder format, and the plan
// next to it. For WETH and cbBTC, `quoteUsd` is the market price when the batch is built: the
// pool's floor is fixed in that token, so its USD value then moves with ETH or BTC. Nothing is
// sent: the owners import the batch in the Safe app, check it and sign it.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

import { TGE_DATE } from "@arl/tokenomics";

import { PoolError, buildPoolPlan, safeBatch, type PoolInput } from "./pool.ts";

const [configPath, outPath] = process.argv.slice(2);
if (!configPath || !outPath) {
  process.stderr.write("usage: pool-cli.ts <pools.json> <batch.json>\n");
  process.exit(2);
}

try {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as Omit<PoolInput, "deadline"> & {
    deadline?: number;
  };
  const deadline = config.deadline ?? Math.floor(Date.parse(TGE_DATE) / 1000) + 30 * 86_400;
  const plan = buildPoolPlan({ ...config, deadline });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    `${JSON.stringify(safeBatch(plan, config.liquiditySafe, Date.now()), null, 2)}\n`,
  );
  writeFileSync(outPath.replace(/\.json$/, ".plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  const pools = plan.legs
    .map((l) => `ARL/${l.quote} ${String(BigInt(l.arlAmountWei) / 10n ** 18n)} ARL`)
    .join(", ");
  process.stdout.write(`pool batch written: ${outPath} (${pools})\n`);
} catch (error) {
  const message = error instanceof PoolError ? error.message : String(error);
  process.stderr.write(`pool batch rejected: ${message}\n`);
  process.exit(1);
}
