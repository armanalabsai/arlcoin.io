// The testnet operator's HTTP API (server hosting only; the static export has no API). Base
// Sepolia only: on the local chain the app plays these roles with development accounts.
//
//   GET  /api/operator/status   → operator address and balances
//   POST /api/operator/faucet   { account }                                 → 1,000 testnet ARL
//   POST /api/operator/join     { account, commitment, signature }          → added to the poll
//   POST /api/operator/relay    { scope, message, root, nullifier, proof }   → vote submitted
//   POST /api/operator/settle   { payload, requirements, amount }            → x402 settlement
import { NextResponse } from "next/server";

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
import scaffoldConfig from "~~/scaffold.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status = 200) =>
  new NextResponse(
    JSON.stringify(body, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)),
    { status, headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );

function actionOf(value: string): OperatorAction {
  if (!(OPERATOR_ACTIONS as readonly string[]).includes(value))
    throw new OperatorRequestError("unknown action", 404);
  return value as OperatorAction;
}

function failure(error: unknown) {
  if (error instanceof OperatorRequestError) return json({ error: error.message }, error.status);
  process.stderr.write(
    `operator error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  const text = error instanceof Error ? error.message : String(error);
  // Two requests can race for the operator's next nonce; the caller may simply retry.
  if (/nonce|replacement|underpriced/i.test(text))
    return json({ error: "the operator is busy; try again in a few seconds" }, 503);
  return json({ error: "the operator could not complete the request" }, 500);
}

type Context = { params: Promise<{ action: string }> };

export async function GET(_req: Request, { params }: Context) {
  try {
    if (actionOf((await params).action) !== "status") return json({ error: "use POST" }, 405);
    return json(await status());
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: Request, { params }: Context) {
  try {
    const action = actionOf((await params).action);
    if (action === "status") return json({ error: "use GET" }, 405);
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
        return json(await faucet(parseFaucet(body).account));
      case "join":
        return json(await join(parseJoin(body)));
      case "relay":
        return json(await relay(parseRelay(body)));
      case "settle":
        return json(
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
    return failure(e);
  }
}
