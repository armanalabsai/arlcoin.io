// GET /api/supply              -> circulating supply of ARL, in whole ARL, as plain text
// GET /api/supply?q=total      -> total supply
// GET /api/supply?q=circulating
//
// The endpoint CoinGecko and CoinMarketCap read. Every request reads the chain: totalSupply minus
// the balances of the protocol-controlled and locked addresses listed in supply-config.json, which
// `packages/deploy/src/supply-config-cli.ts` writes from the verified deployment manifest (same
// rule as packages/deploy/src/circulating.ts). Without that file it answers 404: there is no
// number to report before the Base Mainnet deployment, and none is ever hard-coded.

import { readFile } from "node:fs/promises";

import { formatArl, supply } from "./_supply-core.mjs";

export { formatArl, supply };

async function loadConfig() {
  try {
    return JSON.parse(await readFile(new URL("./supply-config.json", import.meta.url), "utf8"));
  } catch {
    return null;
  }
}

export async function GET(request) {
  const q = new URL(request.url).searchParams.get("q") ?? "circulating";
  if (q !== "total" && q !== "circulating") {
    return new Response("q must be total or circulating\n", { status: 400 });
  }
  const config = await loadConfig();
  if (!config) return new Response("ARL is not on Base Mainnet yet\n", { status: 404 });
  try {
    const value = await supply(config, q);
    return new Response(formatArl(value), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
        "access-control-allow-origin": "*",
      },
    });
  } catch {
    return new Response("supply temporarily unavailable\n", { status: 503 });
  }
}
