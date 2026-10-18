// arl-reexec-result/1: what a run produced. Its keccak256 over canonical JSON is the deliverable
// the provider submits to ARLJobs and the hash every validator recomputes. Only the exit status
// and the declared output files count: logs and timings are not part of the result, so a job
// must write what matters (test summary, coverage) to /out deterministically.

import type { Hex } from "viem";

import { canonicalHash } from "./canonical.ts";
import type { ReexecSpec } from "./spec.ts";

export const RESULT_VERSION = "arl-reexec-result/1";

export interface OutputEntry {
  path: string;
  /** SHA-256 of the file, lowercase hex; null if the job did not write it. */
  sha256: string | null;
}

export interface ResultManifest {
  version: typeof RESULT_VERSION;
  spec_hash: Hex;
  /** Exit code, or null when the job was killed at its time limit. */
  exit_code: number | null;
  timed_out: boolean;
  outputs: OutputEntry[];
}

export function resultHash(result: ResultManifest): Hex {
  return canonicalHash(result);
}

export interface Acceptance {
  ok: boolean;
  reason: string;
}

/** Whether the result meets the spec's own acceptance conditions (independent of any provider). */
export function acceptance(spec: ReexecSpec, result: ResultManifest): Acceptance {
  if (result.timed_out) return { ok: false, reason: "timed out" };
  if (spec.expected_exit_code !== undefined && result.exit_code !== spec.expected_exit_code) {
    return { ok: false, reason: `exit code ${result.exit_code} != ${spec.expected_exit_code}` };
  }
  if (spec.expected_output_hash !== undefined && resultHash(result) !== spec.expected_output_hash) {
    return { ok: false, reason: "result hash differs from expected_output_hash" };
  }
  return { ok: true, reason: "accepted" };
}
