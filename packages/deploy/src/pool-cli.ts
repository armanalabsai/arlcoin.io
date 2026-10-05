// Usage: node packages/deploy/src/pool-cli.ts <token> <liquiditySafe> <arlAmount> <batch.json>
//          [priceUsd=0.20] [deadline=TGE + 30 days]
//
// Writes the Liquidity Safe's launch-liquidity batch (Uniswap v3 ARL/USDC 1%, ARL only, from
// the listing price up) in the Safe Transaction Builder format, plus the plan next to it.
// Nothing is sent: the owners import the batch in the Safe app, check it and sign it.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

import { TGE_DATE } from "@arl/tokenomics";

import { PoolError, buildPoolPlan, safeBatch } from "./pool.ts";

const [token, liquiditySafe, arlAmount, outPath, priceUsd = "0.20", deadlineArg] =
  process.argv.slice(2);
if (!token || !liquiditySafe || !arlAmount || !outPath) {
  process.stderr.write(
    "usage: pool-cli.ts <token> <liquiditySafe> <arlAmount> <batch.json> [priceUsd] [deadline]\n",
  );
  process.exit(2);
}

try {
  const deadline = deadlineArg
    ? Number(deadlineArg)
    : Math.floor(Date.parse(TGE_DATE) / 1000) + 30 * 86_400;
  const plan = buildPoolPlan({ token, liquiditySafe, arlAmount, priceUsd, deadline });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    `${JSON.stringify(safeBatch(plan, liquiditySafe, Date.now()), null, 2)}\n`,
  );
  writeFileSync(outPath.replace(/\.json$/, ".plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  process.stdout.write(
    `pool batch written: ${outPath} (ARL is token${plan.arlIsToken0 ? "0" : "1"}, ticks ${String(plan.tickLower)}..${String(plan.tickUpper)}, ${arlAmount} ARL from ${priceUsd} USD)\n`,
  );
} catch (error) {
  const message = error instanceof PoolError ? error.message : String(error);
  process.stderr.write(`pool batch rejected: ${message}\n`);
  process.exit(1);
}
