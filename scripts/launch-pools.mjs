// Writes the two TGE pool inputs for packages/deploy/src/pool-cli.ts, with the approved amounts
// (owner decisions 2026-10-06, 2026-10-10 and 2026-10-17). Used by the mainnet fork rehearsal and
// by scripts/launch-day-pools.sh, so both build exactly the same batches.
//
//   Liquidity Safe:     2,000,000 ARL (USDC 800,000, USDT 400,000, WETH 600,000, cbBTC 200,000)
//   Public Launch Safe: 3,000,000 ARL (USDC 750,000, USDT 900,000, WETH 675,000, cbBTC 675,000);
//                       it keeps 500,000 ARL for the later airdrop and 1,500,000 ARL for launchpads.
//
// Usage: node scripts/launch-pools.mjs <out-dir> <token> <liquidity-safe> <public-launch-safe>
//          <eth-usd> <btc-usd>     (prices as Chainlink answers with 8 decimals)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const [outDir, token, liquiditySafe, publicLaunchSafe, eth, btc] = process.argv.slice(2);
if (!btc) {
  process.stderr.write(
    "usage: launch-pools.mjs <out-dir> <token> <liquidity-safe> <public-launch-safe> <eth-usd> <btc-usd>\n",
  );
  process.exit(2);
}
const usd = (x) => (Number(x) / 1e8).toFixed(2); // Chainlink feeds: 8 decimals
const TGE = 1792713600; // 2026-10-23T00:00:00Z
const legs = (usdc, usdt, weth, cbbtc) => [
  { quote: "USDC", arlAmount: usdc, quoteUsd: "1" },
  { quote: "USDT", arlAmount: usdt, quoteUsd: "1" },
  { quote: "WETH", arlAmount: weth, quoteUsd: usd(eth) },
  { quote: "cbBTC", arlAmount: cbbtc, quoteUsd: usd(btc) },
];
const common = { token, priceUsd: "0.20", deadline: TGE + 30 * 86400 };
const write = (name, body) =>
  writeFileSync(join(outDir, name), `${JSON.stringify(body, null, 2)}\n`);
write("pools.json", {
  ...common,
  liquiditySafe,
  legs: legs("800000", "400000", "600000", "200000"),
});
// The batch format names the funding Safe "liquiditySafe"; allocation picks the cap.
write("pools-public-launch.json", {
  ...common,
  liquiditySafe: publicLaunchSafe,
  allocation: "publicLaunch",
  legs: legs("750000", "900000", "675000", "675000"),
});
process.stdout.write(`ETH ${usd(eth)} USD, BTC ${usd(btc)} USD (Chainlink)\n`);
