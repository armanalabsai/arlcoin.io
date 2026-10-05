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

const RPC = { 8453: "https://mainnet.base.org", 84532: "https://sepolia.base.org" };
const TOTAL_SUPPLY = "0x18160ddd";
const BALANCE_OF = "0x70a08231";

async function loadConfig() {
  try {
    return JSON.parse(await readFile(new URL("./supply-config.json", import.meta.url), "utf8"));
  } catch {
    return null;
  }
}

async function rpc(url, calls) {
  const body = calls.map((c, id) => ({
    jsonrpc: "2.0",
    id,
    method: "eth_call",
    params: [{ to: c.to, data: c.data }, c.block],
  }));
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json();
  if (!Array.isArray(out)) throw new Error("rpc: unexpected response");
  return calls.map((_, id) => {
    const r = out.find((x) => x.id === id);
    if (!r || r.error || typeof r.result !== "string") throw new Error("rpc: call failed");
    return BigInt(r.result);
  });
}

/** Whole-ARL decimal string from base units (18 decimals), without trailing zeros. */
export function formatArl(units) {
  const whole = units / 10n ** 18n;
  const frac = (units % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

export async function supply(config, which) {
  const url = RPC[config.chainId];
  if (!url) throw new Error("unsupported chain");
  const blockRes = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  const block = (await blockRes.json()).result;
  if (typeof block !== "string") throw new Error("rpc: no block");
  const calls = [{ to: config.token, data: TOTAL_SUPPLY, block }].concat(
    config.locked.map((a) => ({
      to: config.token,
      data: BALANCE_OF + a.toLowerCase().replace(/^0x/, "").padStart(64, "0"),
      block,
    })),
  );
  const [total, ...balances] = await rpc(url, calls);
  if (which === "total") return total;
  const locked = balances.reduce((s, b) => s + b, 0n);
  if (locked > total) throw new Error("locked exceeds total");
  return total - locked;
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
