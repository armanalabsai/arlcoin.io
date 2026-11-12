// Cloudflare Pages Function: POST arlcoin.io/api/whitelist (apps/web/api/whitelist.mjs has the
// rule). `WHITELIST_DB` is the D1 database `arl-whitelist`, bound in wrangler.toml.
import { handle } from "../../apps/web/api/whitelist.mjs";

export function onRequest({ request, env }) {
  return handle(request, env.WHITELIST_DB);
}
