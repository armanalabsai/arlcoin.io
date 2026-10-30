// Cloudflare Pages Function: GET arlcoin.io/api/supply (apps/web/api/supply.mjs has the rule).
import config from "../../apps/web/api/supply-config.json";
import { handle } from "../../apps/web/api/supply.mjs";

export function onRequestGet({ request }) {
  return handle(request, config);
}
