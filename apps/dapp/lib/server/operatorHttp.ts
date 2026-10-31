// The testnet operator's HTTP handler on web-standard Request and Response, shared by the Next.js
// route (local development) and the Cloudflare Pages Function at arlcoin.io/api/operator/*
// (functions/api/operator/[action].js). Base Sepolia only.
//
//   GET  /api/operator/status   → operator address and balances
//   POST /api/operator/faucet   { account }                                 → 1,000 testnet ARL
//   POST /api/operator/join     { account, commitment, signature }          → added to the poll
//   POST /api/operator/relay    { scope, message, root, nullifier, proof }   → vote submitted
//   POST /api/operator/settle   { payload, requirements, amount }            → x402 settlement
import { ARL } from "~~/lib/contracts";
import {
  MAX_BODY_BYTES,
  OPERATOR_ACTIONS,
  OperatorRequestError,
  parseFaucet,
  parseJoin,
  parseRelay,
  parseSettle,
  type OperatorAction,
} from "~~/lib/operatorRules";
import { faucet, join, operatorAddress, relay, settle, status } from "~~/lib/server/operator";
import { RateLimiter, clientKey } from "~~/lib/server/rateLimit";
import scaffoldConfig from "~~/scaffold.config";

/**
 * Origins whose pages may call this API from the browser: the static copy of the app on the
 * website (arlcoin.io/app). ARL_OPERATOR_ORIGINS (comma-separated) replaces the default.
 */
function origins(): string[] {
  return (process.env.ARL_OPERATOR_ORIGINS ?? "https://arlcoin.io,https://www.arlcoin.io")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function cors(origin: string | null): Record<string, string> {
  if (!origin || !origins().includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

const json = (origin: string | null, body: unknown, status = 200, extra: HeadersInit = {}) =>
  new Response(
    JSON.stringify(body, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)),
    {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        ...cors(origin),
        ...extra,
      },
    },
  );

function actionOf(value: string): OperatorAction {
  if (!(OPERATOR_ACTIONS as readonly string[]).includes(value))
    throw new OperatorRequestError("unknown action", 404);
  return value as OperatorAction;
}

function failure(origin: string | null, error: unknown) {
  if (error instanceof OperatorRequestError)
    return json(origin, { error: error.message }, error.status);
  // The Pages Function runtime collects console output as its log; no request body is written.
  // eslint-disable-next-line no-console
  console.error(
    `operator error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  const text = error instanceof Error ? error.message : String(error);
  // Two requests can race for the operator's next nonce; the caller may simply retry.
  if (/nonce|replacement|underpriced/i.test(text))
    return json(origin, { error: "the operator is busy; try again in a few seconds" }, 503);
  return json(origin, { error: "the operator could not complete the request" }, 500);
}

/** One limiter per server instance: every POST counts against the client's window. */
const limiter = new RateLimiter();

/** Answers one request to /api/operator/<action>. */
export async function handleOperator(req: Request, actionName: string): Promise<Response> {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method === "GET") {
    try {
      if (actionOf(actionName) !== "status") return json(origin, { error: "use POST" }, 405);
      return json(origin, await status());
    } catch (e) {
      return failure(origin, e);
    }
  }
  if (req.method !== "POST") return json(origin, { error: "method not allowed" }, 405);

  const allowed = limiter.check(clientKey(req.headers));
  if (!allowed.ok)
    return json(origin, { error: "too many requests; try again shortly" }, 429, {
      "retry-after": String(allowed.retryAfterSeconds),
    });
  try {
    const action = actionOf(actionName);
    if (action === "status") return json(origin, { error: "use GET" }, 405);
    const length = Number(req.headers.get("content-length") ?? "0");
    if (length > MAX_BODY_BYTES) throw new OperatorRequestError("body too large", 413);
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) throw new OperatorRequestError("body too large", 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new OperatorRequestError("body is not JSON");
    }
    switch (action) {
      case "faucet":
        return json(origin, await faucet(parseFaucet(body).account));
      case "join":
        return json(origin, await join(parseJoin(body)));
      case "relay":
        return json(origin, await relay(parseRelay(body)));
      case "settle":
        return json(
          origin,
          await settle(
            parseSettle(body, {
              payTo: operatorAddress(),
              asset: ARL.ARLToken.address,
              network: `eip155:${String(scaffoldConfig.targetNetworks[0].id)}`,
            }),
          ),
        );
    }
  } catch (e) {
    return failure(origin, e);
  }
}
