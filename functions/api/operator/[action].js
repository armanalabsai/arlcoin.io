// Cloudflare Pages Function: arlcoin.io/api/operator/<action>, the testnet operator API (Base
// Sepolia only). The handler is apps/dapp/lib/server/operatorHttp.ts, bundled by
// scripts/build-cloudflare.sh into build/operator.mjs. ARL_OPERATOR_KEY is an encrypted variable
// of the Pages project and reaches the handler through process.env (nodejs_compat).
import { handleOperator } from "../../../build/operator.mjs";

export function onRequest({ request, params }) {
  return handleOperator(request, String(params.action));
}
