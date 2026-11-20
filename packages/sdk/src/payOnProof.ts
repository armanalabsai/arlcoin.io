// Pay-on-proof: one wrapper turns an HTTP handler into a service paid through a verified job
// (spec/x402-arl-escrow). The client pays into escrow first, the service does the work, and the
// money reaches the service only after a staked committee has checked the result.
//
// Any runtime that speaks the Fetch API (Next.js route handlers, Hono, Cloudflare Workers, Bun,
// Deno) uses `payOnProof` directly; `expressPayOnProof` adapts it to Express.
//
//   export const POST = payOnProof(
//     { clients, offer: { chainId: 8453, provider, specUri, specHash, budget, committee, threshold: 2 } },
//     async (req) => {
//       const result = await runTheJob(await req.json());   // the work the spec describes
//       return { body: JSON.stringify(result), deliverable: resultHash };
//     },
//   );
//
// Without an `X-ARL-Job` header the service answers 402 with the offer; `payVerified` (or any
// x402 client that knows the `arl-escrow` scheme) opens and funds the job and asks again. With a
// funded job matching the offer, the handler runs once per job, the response carries the job and
// the deliverable, and the deliverable is submitted on chain as soon as enough committee members
// have accepted the job.

import type { Hex } from "viem";

import {
  approveCommittee,
  buildEscrowOffer,
  checkFundedJob,
  submitDeliverable,
  waitForAcceptance,
  type EscrowOfferInput,
} from "./escrowProvider.ts";
import { JOB_HEADER, parseEscrowOffer, type EscrowOffer } from "./payVerified.ts";
import { VerifiedJobError, type VerifiedClients } from "./verified.ts";

/** Header with the deliverable the service submits for the job. */
export const DELIVERABLE_HEADER = "X-ARL-Deliverable";

// The Fetch API's own types, without depending on the DOM library.
type BodyInit = NonNullable<ConstructorParameters<typeof Response>[0]>;
type HeadersInit = NonNullable<ConstructorParameters<typeof Headers>[0]>;

/** What the handler returns: the response body and the deliverable the committee will check. */
export interface PayOnProofResult {
  body: BodyInit | null;
  /** 32-byte deliverable (for re-execution jobs, the result manifest's hash). */
  deliverable: Hex;
  status?: number;
  headers?: HeadersInit;
}

/**
 * Jobs already served. A job pays for one run, so a job id is recorded before the work starts.
 * The default lives in memory and is lost on restart: a service with more than one instance, or
 * one that restarts, passes a durable store (a database table, a KV namespace).
 */
export interface UsedJobs {
  has(key: string): boolean | Promise<boolean>;
  add(key: string): void | Promise<void>;
  delete(key: string): void | Promise<void>;
}

export interface PayOnProofDeps {
  checkFundedJob: typeof checkFundedJob;
  approveCommittee: typeof approveCommittee;
  waitForAcceptance: typeof waitForAcceptance;
  submitDeliverable: typeof submitDeliverable;
}

export interface PayOnProofConfig {
  /** The service's own clients: `walletClient` is the provider named in the offer. */
  clients: VerifiedClients;
  offer: EscrowOfferInput;
  usedJobs?: UsedJobs;
  /** How long to wait for committee members to accept before submitting. */
  acceptance?: { timeoutMs?: number; pollMs?: number };
  /**
   * Keeps the submission alive after the response is sent, on runtimes that stop work when the
   * response ends (Cloudflare Workers: `ctx.waitUntil`, Vercel: `waitUntil`).
   */
  waitUntil?: (work: Promise<unknown>) => void;
  /** Called when the background submission fails; the job then ends refunded to the client. */
  onError?: (error: unknown, jobId: bigint) => void;
  /** For tests: replaces the on-chain calls. */
  deps?: Partial<PayOnProofDeps>;
}

export type PayOnProofHandler = (
  request: Request,
  job: { jobId: bigint; client: `0x${string}` },
) => Promise<PayOnProofResult>;

export function memoryUsedJobs(): UsedJobs {
  const used = new Set<string>();
  return {
    has: (k) => used.has(k),
    add: (k) => {
      used.add(k);
    },
    delete: (k) => {
      used.delete(k);
    },
  };
}

const json = (status: number, body: unknown, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...Object.fromEntries(new Headers(headers)) },
  });

/**
 * What a caller may learn from a failure: the SDK's own checks explain themselves (a job on another
 * chain, an unfunded job); anything else (an RPC or library error) stays on the server.
 */
const publicReason = (e: unknown, fallback: string) =>
  e instanceof VerifiedJobError ? (e.message.split("\n")[0] ?? fallback) : fallback;

/** Wraps `handler` so every call is paid through a verified job before it runs. */
export function payOnProof(
  config: PayOnProofConfig,
  handler: PayOnProofHandler,
): (request: Request) => Promise<Response> {
  const offerBody = buildEscrowOffer(config.offer);
  const offer: EscrowOffer = parseEscrowOffer(offerBody);
  const used = config.usedJobs ?? memoryUsedJobs();
  const deps: PayOnProofDeps = {
    checkFundedJob,
    approveCommittee,
    waitForAcceptance,
    submitDeliverable,
    ...config.deps,
  };

  return async (request) => {
    const header = request.headers.get(JOB_HEADER);
    if (!header) return json(402, offerBody);

    let job: { jobId: bigint; client: `0x${string}` };
    try {
      job = await deps.checkFundedJob(config.clients.publicClient, offer, header);
    } catch (e) {
      return json(402, { ...offerBody, error: publicReason(e, "could not check the job") });
    }

    // One run per job: recorded before the work, released only if the work never started.
    const key = `${offer.network}:${offer.jobs}:${job.jobId.toString()}`.toLowerCase();
    if (await used.has(key)) return json(409, { error: "this job was already served" });
    await used.add(key);

    try {
      await deps.approveCommittee(config.clients, offer, job.jobId);
    } catch (e) {
      await used.delete(key);
      return json(503, {
        error: `could not approve the committee: ${publicReason(e, "try again")}`,
      });
    }

    const result = await handler(request, job);
    if (!/^0x[0-9a-fA-F]{64}$/.test(result.deliverable)) {
      throw new Error("the handler must return a 32-byte deliverable");
    }

    const submission = (async () => {
      await deps.waitForAcceptance(
        config.clients.publicClient,
        offer,
        job.jobId,
        config.acceptance,
      );
      await deps.submitDeliverable(config.clients, offer, job.jobId, result.deliverable);
    })().catch((e: unknown) => {
      config.onError?.(e, job.jobId);
    });
    config.waitUntil?.(submission);

    const headers = new Headers(result.headers);
    headers.set(JOB_HEADER, header);
    headers.set(DELIVERABLE_HEADER, result.deliverable);
    return new Response(result.body, { status: result.status ?? 200, headers });
  };
}

/** The subset of an Express request and response the adapter uses. */
interface ExpressRequest {
  method: string;
  originalUrl: string;
  protocol: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  get(name: string): string | undefined;
}
interface ExpressResponse {
  status(code: number): ExpressResponse;
  setHeader(name: string, value: string): unknown;
  send(body: unknown): unknown;
}

/** `payOnProof` as an Express handler: `app.post("/run", expressPayOnProof(config, handler))`. */
export function expressPayOnProof(config: PayOnProofConfig, handler: PayOnProofHandler) {
  const fetchHandler = payOnProof(config, handler);
  return async (req: ExpressRequest, res: ExpressResponse, next: (e?: unknown) => void) => {
    try {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers.set(k, v);
        else if (Array.isArray(v)) headers.set(k, v.join(", "));
      }
      const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined;
      const body = !hasBody
        ? undefined
        : typeof req.body === "string" || req.body instanceof Uint8Array
          ? req.body
          : JSON.stringify(req.body);
      const url = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;
      const init: ConstructorParameters<typeof Request>[1] & object = {
        method: req.method,
        headers,
      };
      if (body !== undefined) init.body = body as BodyInit;
      const response = await fetchHandler(new Request(url, init));
      res.status(response.status);
      response.headers.forEach((value, name) => {
        res.setHeader(name, value);
      });
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      next(e);
    }
  };
}
