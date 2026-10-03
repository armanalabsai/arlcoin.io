// A compute provider paid per second in ARL over x402 `upto`.
//
// 1. `requirements(job, seconds)`: the payer asks to run a job for up to `seconds`; the provider
//    answers with the x402 requirements for a ceiling of price × seconds.
// 2. `execute(…)`: the payer sends the signed authorization with the job's input. The provider
//    rebuilds the requirements itself (it never trusts the payer's copy), has the facilitator
//    verify the authorization, runs the job killed at `seconds`, bills the seconds used (any part
//    of a second counts as one), and settles that amount, never above the ceiling.
//
// One authorization pays for one run. The payments policy refuses authorizations that live
// longer than MAX_AUTHORIZATION_SECONDS, and an authorization must still be valid when the run
// is settled, so a run here is at most MAX_AUTHORIZATION_SECONDS minus a settlement margin.
// Longer jobs would need consecutive authorizations, which this reference does not implement.

import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { getAddress } from "viem";

import {
  MAX_AUTHORIZATION_SECONDS,
  MIN_AUTHORIZATION_SECONDS,
  authorizationKey,
  buildUptoRequirements,
  meter,
  readAuthorization,
  type ArlUptoFacilitator,
} from "@arl/payments";

import { JobStartError, runProcess, type ComputeJob, type Runner } from "./runner.ts";

/** Time left on an authorization after the run, for the settlement to be sent. */
export const SETTLEMENT_MARGIN_SECONDS = 60;
/** Longest run one authorization can pay for. */
export const MAX_RUN_SECONDS = MAX_AUTHORIZATION_SECONDS - SETTLEMENT_MARGIN_SECONDS;

export interface ProviderConfig {
  chainId: number;
  /** The deployed ARL token, from the deployment manifest. */
  arlToken: string;
  /** The provider's public address that receives payments. */
  payTo: string;
  /** The facilitator's public address, bound into what the payer signs. */
  facilitatorAddress: string;
  /** Price of one second of a job, in ARL base units. */
  pricePerSecond: bigint;
  /** Longest run the provider accepts, in seconds (at most MAX_RUN_SECONDS). */
  maxSeconds: number;
  jobs: Record<string, ComputeJob>;
  facilitator: Pick<ArlUptoFacilitator, "verify" | "settle">;
  maxInputBytes?: number;
  maxOutputBytes?: number;
  /** Replaces the process runner, for tests. */
  runner?: Runner;
}

export interface JobResult {
  job: string;
  exitCode: number | null;
  timedOut: boolean;
  /** The job's output; empty when the settlement failed. */
  stdout: Buffer;
  stderr: Buffer;
  truncated: boolean;
  billedSeconds: bigint;
  /** Amount settled, in ARL base units. */
  amount: bigint;
  /** Usage reached the signed ceiling. */
  capped: boolean;
  settlement: SettleResponse;
}

export class ProviderError extends Error {
  override name = "ProviderError";
  /** HTTP status the server answers with. */
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Whole seconds billed for `elapsedMs`: any part of a second counts, no time costs nothing. */
export function billedSeconds(elapsedMs: number): bigint {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error("elapsed time is invalid");
  return BigInt(Math.ceil(elapsedMs / 1000));
}

export class ComputeProvider {
  readonly #c: Required<Omit<ProviderConfig, "runner">> & { runner: Runner };
  /** Authorizations that started a run. Each pays for one run only, so none starts a second. */
  readonly #used = new Set<string>();

  constructor(config: ProviderConfig) {
    if (config.pricePerSecond <= 0n) throw new Error("pricePerSecond must be positive");
    if (
      !Number.isInteger(config.maxSeconds) ||
      config.maxSeconds < 1 ||
      config.maxSeconds > MAX_RUN_SECONDS
    ) {
      throw new Error(`maxSeconds must be from 1 to ${String(MAX_RUN_SECONDS)}`);
    }
    if (Object.keys(config.jobs).length === 0) throw new Error("no jobs configured");
    this.#c = {
      maxInputBytes: 1 << 20,
      maxOutputBytes: 1 << 20,
      runner: runProcess,
      ...config,
      payTo: getAddress(config.payTo),
    };
    // Fails here, at start-up, on Base Mainnet or any other unsupported chain.
    this.requirements(Object.keys(config.jobs)[0] ?? "", 1);
  }

  get jobs(): string[] {
    return Object.keys(this.#c.jobs);
  }

  get pricePerSecond(): bigint {
    return this.#c.pricePerSecond;
  }

  get maxSeconds(): number {
    return this.#c.maxSeconds;
  }

  get maxInputBytes(): number {
    return this.#c.maxInputBytes;
  }

  /** What the payer must sign to run `job` for up to `seconds`. */
  requirements(job: string, seconds: number): PaymentRequirements {
    if (!Object.hasOwn(this.#c.jobs, job)) throw new ProviderError(`unknown job ${job}`, 404);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > this.#c.maxSeconds) {
      throw new ProviderError(
        `a run is from 1 to ${String(this.#c.maxSeconds)} seconds on this provider`,
        400,
      );
    }
    return buildUptoRequirements({
      chainId: this.#c.chainId,
      arlToken: this.#c.arlToken,
      maxAmount: this.#c.pricePerSecond * BigInt(seconds),
      payTo: this.#c.payTo,
      facilitator: this.#c.facilitatorAddress,
      maxTimeoutSeconds: Math.max(seconds + SETTLEMENT_MARGIN_SECONDS, MIN_AUTHORIZATION_SECONDS),
    });
  }

  /** Verifies the authorization, runs the job for at most `seconds`, settles the seconds used. */
  async execute(
    job: string,
    seconds: number,
    input: Buffer,
    payload: PaymentPayload,
  ): Promise<JobResult> {
    const expected = this.requirements(job, seconds);
    if (input.length > this.#c.maxInputBytes) throw new ProviderError("input too large", 413);
    const a = payload.accepted;
    if (
      a.scheme !== expected.scheme ||
      a.network !== expected.network ||
      getAddress(a.asset) !== expected.asset ||
      getAddress(a.payTo) !== expected.payTo ||
      a.amount !== expected.amount
    ) {
      throw new ProviderError("the payment does not match this job and duration", 402);
    }
    const verified = await this.#c.facilitator.verify(payload, expected);
    if (!verified.isValid) {
      throw new ProviderError(
        `payment refused: ${verified.invalidReason ?? "invalid authorization"}`,
        402,
      );
    }

    let key: string;
    try {
      key = authorizationKey(this.#c.chainId, readAuthorization(payload.payload));
    } catch {
      throw new ProviderError("not an upto authorization", 402);
    }
    if (this.#used.has(key)) throw new ProviderError("this authorization was already used", 409);
    this.#used.add(key);

    let run;
    try {
      run = await this.#c.runner(this.#c.jobs[job] as ComputeJob, input, {
        seconds,
        maxOutputBytes: this.#c.maxOutputBytes,
      });
    } catch (error) {
      // Not started: nothing used, nothing settled; the authorization simply expires.
      if (error instanceof JobStartError) throw new ProviderError(error.message, 500);
      throw error;
    }

    const billed = billedSeconds(run.elapsedMs);
    const { amount, capped } = meter({
      unitPrice: this.#c.pricePerSecond,
      units: billed,
      ceiling: BigInt(expected.amount),
    });
    const settlement = await this.#c.facilitator.settle(payload, {
      ...expected,
      amount: amount.toString(),
    });
    const paid = settlement.success;
    return {
      job,
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      stdout: paid ? run.stdout : Buffer.alloc(0),
      stderr: paid ? run.stderr : Buffer.alloc(0),
      truncated: run.truncated,
      billedSeconds: billed,
      amount,
      capped,
      settlement,
    };
  }
}
