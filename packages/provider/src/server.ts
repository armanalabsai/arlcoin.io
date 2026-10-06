// HTTP front of the provider, speaking x402 v2 with the SDK's own header encoding.
//
//   GET  /jobs                      → the jobs, price per second and longest run
//   POST /jobs/<name>?seconds=<n>   → without a payment: 402 with PAYMENT-REQUIRED
//                                     with PAYMENT-SIGNATURE: runs the job (body is its stdin)
//                                     and answers with PAYMENT-RESPONSE and the job's output
//
// Uses node:http only; put it behind a TLS-terminating proxy on a public network.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { isPaymentPayloadV2 } from "@x402/core/schemas";

import { ProviderError, type ComputeProvider } from "./provider.ts";

const send = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage, limit: number) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new ProviderError("input too large", 413));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });

export function createProviderServer(provider: ComputeProvider): Server {
  return createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      if (error instanceof ProviderError) send(res, error.status, { error: error.message });
      else send(res, 500, { error: "internal error" });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://provider");
    if (req.method === "GET" && url.pathname === "/jobs") {
      send(res, 200, {
        jobs: provider.jobs,
        pricePerSecond: provider.pricePerSecond.toString(),
        maxSeconds: provider.maxSeconds,
      });
      return;
    }
    const match = /^\/jobs\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (req.method !== "POST" || !match?.[1]) {
      send(res, 404, { error: "not found" });
      return;
    }
    const job = match[1];
    const seconds = Number(url.searchParams.get("seconds"));
    const requirements = provider.requirements(job, seconds);

    const header = req.headers["payment-signature"];
    if (typeof header !== "string") {
      req.resume();
      send(
        res,
        402,
        { error: "payment required" },
        {
          "PAYMENT-REQUIRED": encodePaymentRequiredHeader({
            x402Version: 2,
            resource: {
              url: url.pathname + url.search,
              description: `${job}, up to ${String(seconds)} s`,
              mimeType: "application/json",
            },
            accepts: [requirements],
          }),
        },
      );
      return;
    }
    let payload;
    try {
      payload = decodePaymentSignatureHeader(header);
    } catch {
      throw new ProviderError("unreadable PAYMENT-SIGNATURE header", 400);
    }
    if (!isPaymentPayloadV2(payload)) throw new ProviderError("not an x402 v2 payment", 400);

    const input = await readBody(req, provider.maxInputBytes);
    const result = await provider.execute(job, seconds, input, payload);
    send(
      res,
      result.settlement.success ? 200 : 402,
      {
        job: result.job,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
        billedSeconds: result.billedSeconds.toString(),
        amount: result.amount.toString(),
        capped: result.capped,
        stdout: result.stdout.toString("base64"),
        stderr: result.stderr.toString("base64"),
      },
      { "PAYMENT-RESPONSE": encodePaymentResponseHeader(result.settlement) },
    );
  }
}
