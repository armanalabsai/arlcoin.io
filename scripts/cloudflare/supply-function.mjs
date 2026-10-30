// Cloudflare Pages Function for /api/supply, staged by scripts/build-cloudflare.sh as
// functions/api/supply/index.js. Same answers as the Vercel function (apps/web/api/supply.mjs):
//
//   GET /api/supply/                 -> circulating supply of ARL, in whole ARL, as plain text
//   GET /api/supply/?q=total         -> total supply
//   GET /api/supply/?q=circulating
//
// supply-config.json is copied next to the shared core at build time; it holds null before the
// Base Mainnet deployment, and then the endpoint answers 404.

import config from "../../../lib/supply-config.json";
import { formatArl, supply } from "../../../lib/_supply-core.mjs";

export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams.get("q") ?? "circulating";
  if (q !== "total" && q !== "circulating") {
    return new Response("q must be total or circulating\n", { status: 400 });
  }
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
