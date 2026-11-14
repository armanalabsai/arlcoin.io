// arl-proof/1: the proof envelope a provider publishes for one job (spec/arl-proof/v0.1.0).
// It binds the delivered result and its evidence to the task (task hash) and to the on-chain job
// (chain, escrow, job id). Only a hash goes on chain: `ARLJobs.submit(jobId, deliverable)`.
// A proof is a claim, never a verification: validators check it under the task's policy.

import type { Address, Hex } from "viem";

import { canonicalHash } from "./canonical.ts";
import { EVIDENCE_KINDS, type EvidenceKind, type Task, taskHash } from "./task.ts";

export const PROOF_VERSION = "arl-proof/1";
export const REEXEC_RESULT_VERSION = "arl-reexec-result/1";

export interface ContentRef {
  /** Where the content lives: https:// or ipfs://. */
  uri: string;
  /** SHA-256 of the content bytes, lowercase hex (no prefix). */
  sha256: string;
  media_type: string;
  bytes: number;
}

export interface ModelRef {
  /** Model name as published, for example an open Nemotron checkpoint. */
  name: string;
  /** SHA-256 of the weights archive the verdict was produced with, lowercase hex. */
  weights_sha256: string;
  /** Inference runtime and version, for example "vllm/0.x". */
  runtime: string;
}

export interface EvidenceItem {
  kind: EvidenceKind;
  uri: string;
  sha256: string;
  media_type: string;
  /** Required for model-verdict evidence. */
  model?: ModelRef;
}

/** arl-reexec-result/1, as produced by `arl-verifier run` (packages/verifier/src/result.ts). */
export interface ReexecResult {
  version: typeof REEXEC_RESULT_VERSION;
  spec_hash: Hex;
  exit_code: number | null;
  timed_out: boolean;
  outputs: { path: string; sha256: string | null }[];
}

export interface Proof {
  version: typeof PROOF_VERSION;
  task_hash: Hex;
  chain_id: number;
  jobs: Address;
  /** ARLJobs job id, decimal string. */
  job_id: string;
  deliverable: ContentRef;
  /** Required for reexec tasks; its hash is the on-chain deliverable. */
  result_manifest?: ReexecResult;
  evidence: EvidenceItem[];
}

export class ProofError extends Error {
  override name = "ProofError";
}

const HASH = /^0x[0-9a-f]{64}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DIGITS = /^(0|[1-9][0-9]*)$/;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,62}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,62}$/;
const PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const MAX_EVIDENCE = 32;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function onlyKeys(v: Record<string, unknown>, allowed: readonly string[], what: string): void {
  for (const k of Object.keys(v)) {
    if (!allowed.includes(k)) throw new ProofError(`${what}: unknown field ${k}`);
  }
}

function str(v: unknown, max: number, what: string): string {
  if (typeof v !== "string" || v.trim().length === 0 || v.length > max) {
    throw new ProofError(`${what} must be a non-empty string of at most ${max} characters`);
  }
  return v;
}

function uri(v: unknown, what: string): string {
  const s = str(v, 2048, what);
  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    throw new ProofError(`${what} is not a URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "ipfs:") {
    throw new ProofError(`${what} must be https or ipfs`);
  }
  return s;
}

function sha256(v: unknown, what: string): string {
  if (typeof v !== "string" || !SHA256.test(v)) {
    throw new ProofError(`${what} must be 64 lowercase hex`);
  }
  return v;
}

function mediaType(v: unknown, what: string): string {
  if (typeof v !== "string" || !MEDIA_TYPE.test(v)) {
    throw new ProofError(`${what} must be a lowercase media type`);
  }
  return v;
}

function contentRef(v: unknown, what: string): ContentRef {
  if (!isRecord(v)) throw new ProofError(`${what} must be an object`);
  onlyKeys(v, ["uri", "sha256", "media_type", "bytes"], what);
  if (typeof v.bytes !== "number" || !Number.isSafeInteger(v.bytes) || v.bytes < 0) {
    throw new ProofError(`${what}.bytes must be a non-negative integer`);
  }
  return {
    uri: uri(v.uri, `${what}.uri`),
    sha256: sha256(v.sha256, `${what}.sha256`),
    media_type: mediaType(v.media_type, `${what}.media_type`),
    bytes: v.bytes,
  };
}

function modelRef(v: unknown, what: string): ModelRef {
  if (!isRecord(v)) throw new ProofError(`${what} must be an object`);
  onlyKeys(v, ["name", "weights_sha256", "runtime"], what);
  return {
    name: str(v.name, 200, `${what}.name`),
    weights_sha256: sha256(v.weights_sha256, `${what}.weights_sha256`),
    runtime: str(v.runtime, 200, `${what}.runtime`),
  };
}

function evidenceItem(v: unknown, i: number): EvidenceItem {
  const what = `evidence[${i}]`;
  if (!isRecord(v)) throw new ProofError(`${what} must be an object`);
  onlyKeys(v, ["kind", "uri", "sha256", "media_type", "model"], what);
  if (typeof v.kind !== "string" || !(EVIDENCE_KINDS as readonly string[]).includes(v.kind)) {
    throw new ProofError(`${what}.kind must be one of ${EVIDENCE_KINDS.join(", ")}`);
  }
  const kind = v.kind as EvidenceKind;
  const item: EvidenceItem = {
    kind,
    uri: uri(v.uri, `${what}.uri`),
    sha256: sha256(v.sha256, `${what}.sha256`),
    media_type: mediaType(v.media_type, `${what}.media_type`),
  };
  if (v.model !== undefined) item.model = modelRef(v.model, `${what}.model`);
  if (kind === "model-verdict" && item.model === undefined) {
    throw new ProofError(
      `${what}: model-verdict evidence must name the model and its weights hash`,
    );
  }
  if (kind !== "model-verdict" && item.model !== undefined) {
    throw new ProofError(`${what}: only model-verdict evidence names a model`);
  }
  return item;
}

function reexecResult(v: unknown): ReexecResult {
  const what = "result_manifest";
  if (!isRecord(v)) throw new ProofError(`${what} must be an object`);
  onlyKeys(v, ["version", "spec_hash", "exit_code", "timed_out", "outputs"], what);
  if (v.version !== REEXEC_RESULT_VERSION) {
    throw new ProofError(`${what}.version must be ${REEXEC_RESULT_VERSION}`);
  }
  if (typeof v.spec_hash !== "string" || !HASH.test(v.spec_hash)) {
    throw new ProofError(`${what}.spec_hash must be 0x and 64 lowercase hex`);
  }
  if (
    v.exit_code !== null &&
    (typeof v.exit_code !== "number" || !Number.isSafeInteger(v.exit_code))
  ) {
    throw new ProofError(`${what}.exit_code must be an integer or null`);
  }
  if (typeof v.timed_out !== "boolean") throw new ProofError(`${what}.timed_out must be a boolean`);
  if (!Array.isArray(v.outputs)) throw new ProofError(`${what}.outputs must be an array`);
  const outputs = v.outputs.map((o, i) => {
    const w = `${what}.outputs[${i}]`;
    if (!isRecord(o)) throw new ProofError(`${w} must be an object`);
    onlyKeys(o, ["path", "sha256"], w);
    if (typeof o.path !== "string" || !PATH.test(o.path)) {
      throw new ProofError(`${w}.path must be a relative path`);
    }
    if (o.sha256 !== null) sha256(o.sha256, `${w}.sha256`);
    return { path: o.path, sha256: o.sha256 as string | null };
  });
  return {
    version: REEXEC_RESULT_VERSION,
    spec_hash: v.spec_hash as Hex,
    exit_code: v.exit_code,
    timed_out: v.timed_out,
    outputs,
  };
}

/** Validates an untrusted proof document and returns it typed. Unknown fields are refused. */
export function parseProof(raw: unknown): Proof {
  if (!isRecord(raw)) throw new ProofError("proof must be an object");
  onlyKeys(
    raw,
    [
      "version",
      "task_hash",
      "chain_id",
      "jobs",
      "job_id",
      "deliverable",
      "result_manifest",
      "evidence",
    ],
    "proof",
  );
  if (raw.version !== PROOF_VERSION) throw new ProofError(`version must be ${PROOF_VERSION}`);
  if (typeof raw.task_hash !== "string" || !HASH.test(raw.task_hash)) {
    throw new ProofError("task_hash must be 0x and 64 lowercase hex");
  }
  if (typeof raw.chain_id !== "number" || !Number.isSafeInteger(raw.chain_id) || raw.chain_id < 1) {
    throw new ProofError("chain_id must be a positive integer");
  }
  if (typeof raw.jobs !== "string" || !ADDRESS.test(raw.jobs)) {
    throw new ProofError("jobs must be an address");
  }
  if (typeof raw.job_id !== "string" || !DIGITS.test(raw.job_id) || raw.job_id === "0") {
    throw new ProofError("job_id must be a positive decimal string");
  }
  if (!Array.isArray(raw.evidence) || raw.evidence.length > MAX_EVIDENCE) {
    throw new ProofError(`evidence must be an array of at most ${MAX_EVIDENCE} items`);
  }
  const proof: Proof = {
    version: PROOF_VERSION,
    task_hash: raw.task_hash as Hex,
    chain_id: raw.chain_id,
    jobs: raw.jobs as Address,
    job_id: raw.job_id,
    deliverable: contentRef(raw.deliverable, "deliverable"),
    evidence: raw.evidence.map(evidenceItem),
  };
  if (raw.result_manifest !== undefined) proof.result_manifest = reexecResult(raw.result_manifest);
  return proof;
}

/** keccak256 of the canonical proof. */
export function proofHash(proof: Proof): Hex {
  return canonicalHash(proof);
}

/**
 * The bytes32 the provider passes to `ARLJobs.submit`: for a reexec task the hash of the
 * arl-reexec-result/1 manifest (what `arl-verifier` recomputes, unchanged), otherwise the proof
 * hash.
 */
export function submittedDeliverable(proof: Proof): Hex {
  return proof.result_manifest !== undefined
    ? canonicalHash(proof.result_manifest)
    : proofHash(proof);
}

/**
 * Structural checks of a proof against its task (no network, no chain): the hashes bind, the
 * required evidence is present, the deliverable fits. Passing this is the precondition for
 * verification, not verification itself.
 */
export function checkProofAgainstTask(task: Task, proof: Proof): void {
  if (proof.task_hash !== taskHash(task)) throw new ProofError("task_hash does not match the task");
  if (proof.deliverable.media_type !== task.deliverable.media_type) {
    throw new ProofError("deliverable media type differs from the task");
  }
  if (
    task.deliverable.max_bytes !== undefined &&
    proof.deliverable.bytes > task.deliverable.max_bytes
  ) {
    throw new ProofError("deliverable is larger than the task allows");
  }
  const kinds = new Set(proof.evidence.map((e) => e.kind));
  if (proof.result_manifest !== undefined) kinds.add("result-manifest");
  for (const k of task.evidence) {
    if (!kinds.has(k)) throw new ProofError(`required evidence missing: ${k}`);
  }
  if (task.workload.class === "reexec") {
    if (proof.result_manifest === undefined) {
      throw new ProofError("a reexec task needs the arl-reexec-result/1 manifest");
    }
    if (proof.result_manifest.spec_hash !== task.workload.spec_hash) {
      throw new ProofError("result_manifest.spec_hash differs from the task's workload spec");
    }
  } else if (proof.result_manifest !== undefined) {
    throw new ProofError("only a reexec task carries a result manifest");
  }
}
