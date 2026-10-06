// Compute on the ARL network: GPU and CPU capacity listed on the ERC-8004 registry and paid per
// second in ARL over x402 `upto`. The payer signs a ceiling for the longest run it accepts; the
// provider measures the run and settles the seconds used, rounded up, never above the ceiling.

import type { ArlService } from "./registry.ts";
import { meter } from "./payments.ts";

/** Whole seconds billed for a run from `startedMs` to `endedMs` (epoch milliseconds): any part
 *  of a second counts as a second, and a run that took no time is billed nothing. */
export function billedSeconds(startedMs: number, endedMs: number): bigint {
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs < startedMs) {
    throw new Error("a run must end after it starts");
  }
  return BigInt(Math.ceil((endedMs - startedMs) / 1000));
}

/** The ceiling a payer signs to run a compute service for up to `seconds`. */
export function computeCeiling(service: ArlService, seconds: number): bigint {
  const c = service.compute;
  if (!c) throw new Error("not a compute service");
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > c.maxSeconds) {
    throw new Error(`a job runs from 1 to ${String(c.maxSeconds)} seconds on this provider`);
  }
  return service.terms.unitPrice * BigInt(seconds);
}

/** Amount to settle for a measured run: price × billed seconds, capped at the signed ceiling. */
export function settleRun(
  service: ArlService,
  startedMs: number,
  endedMs: number,
  ceiling: bigint,
): { seconds: bigint; amount: bigint; capped: boolean } {
  if (!service.compute) throw new Error("not a compute service");
  const seconds = billedSeconds(startedMs, endedMs);
  return { seconds, ...meter(service.terms.unitPrice, seconds, ceiling) };
}

/** One line describing the capacity, for listings. */
export function describeCapacity(service: ArlService): string | undefined {
  const c = service.compute;
  if (!c) return undefined;
  const host = `${String(c.vcpus)} vCPU, ${String(c.memoryGb)} GB RAM`;
  const gpu =
    c.kind === "gpu"
      ? `${String(c.gpus)} × ${c.gpuModel ?? "GPU"} (${String(c.gpuMemoryGb)} GB), `
      : "";
  return `${gpu}${host}, jobs up to ${formatDuration(c.maxSeconds)}`;
}

export function formatDuration(seconds: number): string {
  if (seconds % 3600 === 0) return `${String(seconds / 3600)} h`;
  if (seconds % 60 === 0) return `${String(seconds / 60)} min`;
  return `${String(seconds)} s`;
}
