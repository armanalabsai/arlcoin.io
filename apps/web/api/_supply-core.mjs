// The supply computation behind /api/supply, shared by the Vercel function (supply.mjs) and the
// Cloudflare Pages Function (functions/api/supply/index.js, staged by scripts/build-cloudflare.sh).
// No Node.js imports, so it runs on both. The leading underscore keeps Vercel from serving this
// file as an endpoint.

const RPC = { 8453: "https://mainnet.base.org", 84532: "https://sepolia.base.org" };
const TOTAL_SUPPLY = "0x18160ddd";
const BALANCE_OF = "0x70a08231";

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
