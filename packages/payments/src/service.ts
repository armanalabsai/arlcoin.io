// The facilitator as an HTTP service, speaking the x402 facilitator API that the SDK's
// `HTTPFacilitatorClient` calls (`@x402/core/http`):
//
//   GET  /supported  → the one kind ARL settles: x402 v2, `upto`, Base Sepolia
//   POST /verify     → { x402Version, paymentPayload, paymentRequirements } → VerifyResponse
//   POST /settle     → same body → SettleResponse
//
// Every request goes through `ArlUptoFacilitator` (network gate, ARL asset pin, settlement
// policy). Settling sends a transaction from the facilitator's account, so `/verify` and
// `/settle` can require a bearer token that only the operator's resource servers hold
// (`HTTPFacilitatorClient`'s `createAuthHeaders`). Uses node:http only; put it behind a
// TLS-terminating proxy on a public network.

import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { isPaymentPayloadV2, isPaymentRequirementsV2 } from "@x402/core/schemas";
import type { PaymentPayload, PaymentRequirements, SupportedResponse } from "@x402/core/types";

import type { ArlUptoFacilitator } from "./facilitator.ts";
import { paymentNetwork } from "./networks.ts";

export interface FacilitatorServiceConfig {
  chainId: number;
  facilitator: Pick<ArlUptoFacilitator, "verify" | "settle">;
  /** The facilitator's public address, which pays the settlement gas. */
  signer: string;
  /** When set, `/verify` and `/settle` require `Authorization: Bearer <token>`. */
  bearerToken?: string;
  maxBodyBytes?: number;
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const readJson = (req: IncomingMessage, limit: number) =>
  new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, "body too large"));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "body is not JSON"));
      }
    });
    req.on("error", reject);
  });

function authorized(req: IncomingMessage, token: string | undefined): boolean {
  if (token === undefined) return true;
  const given = Buffer.from(req.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function createFacilitatorServer(config: FacilitatorServiceConfig): Server {
  const net = paymentNetwork(config.chainId);
  const supported: SupportedResponse = {
    kinds: [{ x402Version: 2, scheme: "upto", network: net.network }],
    extensions: [],
    signers: { [net.network]: [config.signer] },
  };
  const limit = config.maxBodyBytes ?? 64 * 1024;

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const path = new URL(req.url ?? "/", "http://facilitator").pathname;
    if (req.method === "GET" && path === "/supported") {
      json(res, 200, supported);
      return;
    }
    if (req.method !== "POST" || (path !== "/verify" && path !== "/settle")) {
      json(res, 404, { error: "not found" });
      return;
    }
    if (!authorized(req, config.bearerToken)) {
      req.resume();
      json(res, 401, { error: "unauthorized" });
      return;
    }
    const body = (await readJson(req, limit)) as {
      paymentPayload?: unknown;
      paymentRequirements?: unknown;
    } | null;
    const payload = body?.paymentPayload;
    const requirements = body?.paymentRequirements;
    if (!isPaymentPayloadV2(payload) || !isPaymentRequirementsV2(requirements)) {
      throw new HttpError(400, "not an x402 v2 payment and requirements");
    }
    // Shape checked by the SDK's schemas above; the wrapper checks network, asset and policy.
    const p = payload as PaymentPayload;
    const r = requirements as PaymentRequirements;
    json(
      res,
      200,
      path === "/verify"
        ? await config.facilitator.verify(p, r)
        : await config.facilitator.settle(p, r),
    );
  }

  return createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (error instanceof HttpError) json(res, error.status, { error: error.message });
      // Details of a failure (an RPC error, a malformed payload) are not echoed to the caller.
      else json(res, 500, { error: "internal error" });
    });
  });
}
