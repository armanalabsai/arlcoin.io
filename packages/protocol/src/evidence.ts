// arl-evidence/2: a portable, independently verifiable package for one task (spec/arl-evidence/
// v0.2.0). It wraps the on-chain settlement record of arl-evidence/1 (built and re-checked
// against any RPC by `arl-verifier bundle` / `verify-bundle`) together with the documents that
// give it meaning: the arl-task/1 task, the arl-proof/1 proof and the arl-policy/1 policy.
// `checkEvidence` checks, offline, that all four agree with each other.

import type { Address, Hex } from "viem";

import { parsePolicy, policyHash, checkTaskAgainstPolicy, POLICY_VERSION } from "./policy.ts";
import { checkProofAgainstTask, parseProof, submittedDeliverable } from "./proof.ts";
import { committedSpecHash, parseTask, taskHash } from "./task.ts";

export const EVIDENCE_VERSION = "arl-evidence/2";

interface EventRef {
  block: string;
  tx: Hex;
}

/** arl-evidence/1, as produced by `arl-verifier bundle` (packages/verifier/src/bundle.ts). */
export interface SettlementRecord {
  version: "arl-evidence/1";
  chainId: number;
  jobs: Address;
  evaluator: Address;
  jobId: string;
  job: { client: Address; provider: Address; budget: string; status: number; description: string };
  config: { tier: number; threshold: number; specHash: Hex; committee: Address[] };
  submitted: (EventRef & { deliverable: Hex }) | null;
  votes: (EventRef & { validator: Address; approve: boolean; deliverable: Hex; evidence: Hex })[];
  decided: (EventRef & { approved: boolean }) | null;
  finalized: (EventRef & { approved: boolean; voteHash: Hex }) | null;
  settlement: (EventRef & { outcome: "completed" | "rejected" }) | null;
}

export interface EvidenceV2 {
  version: typeof EVIDENCE_VERSION;
  settlement: SettlementRecord;
  task: unknown;
  proof: unknown;
  policy: unknown;
  /** keccak256 of the canonical policy, so a reader can pin the exact policy text. */
  policy_hash: Hex;
}

export class EvidenceError extends Error {
  override name = "EvidenceError";
}

const TIER_INDEX = { fallback: 0, reexecution: 1, attested: 2 } as const;

export interface EvidenceResult {
  outcome: "completed" | "rejected" | "pending";
  approvals: number;
  rejections: number;
  /** The settlement differs from the committee's decision (a dispute was ruled). */
  overturned: boolean;
}

/**
 * Checks that the settlement record, task, proof and policy describe the same job and agree.
 * Throws EvidenceError (or the document's own error) on the first inconsistency. It does not
 * re-read the chain: run `arl-verifier verify-bundle` on `settlement` for that.
 */
export function checkEvidence(raw: EvidenceV2): EvidenceResult {
  // The bundle is untrusted input: check the versions as plain values.
  const versions = raw as { version: unknown; settlement: { version: unknown } };
  if (versions.version !== EVIDENCE_VERSION)
    throw new EvidenceError("version must be arl-evidence/2");
  if (versions.settlement.version !== "arl-evidence/1") {
    throw new EvidenceError("settlement must be arl-evidence/1");
  }
  const s = raw.settlement;

  const task = parseTask(raw.task);
  const proof = parseProof(raw.proof);
  const policy = parsePolicy(raw.policy);
  if (policyHash(policy) !== raw.policy_hash)
    throw new EvidenceError("policy_hash does not match the policy");
  if (task.verification.policy !== `${POLICY_VERSION}:${policy.id}`) {
    throw new EvidenceError("the task names another policy");
  }
  checkTaskAgainstPolicy(task, policy);
  checkProofAgainstTask(task, proof);

  // The proof names this job.
  if (proof.chain_id !== s.chainId)
    throw new EvidenceError("proof chain differs from the settlement");
  if (proof.jobs.toLowerCase() !== s.jobs.toLowerCase())
    throw new EvidenceError("proof escrow differs");
  if (proof.job_id !== s.jobId) throw new EvidenceError("proof job id differs");

  // The job on chain was opened for this task.
  const th = taskHash(task);
  if (!s.job.description.startsWith(`arl-task:${th} `)) {
    throw new EvidenceError("the on-chain description does not name this task");
  }
  if (s.job.budget !== task.payment.budget)
    throw new EvidenceError("on-chain budget differs from the task");
  if (s.config.specHash !== committedSpecHash(task)) {
    throw new EvidenceError("on-chain specHash differs from the task's committed spec hash");
  }
  if (s.config.tier !== TIER_INDEX[task.verification.tier])
    throw new EvidenceError("on-chain tier differs");
  if (s.config.threshold !== task.verification.threshold)
    throw new EvidenceError("on-chain threshold differs");
  if (s.config.committee.length !== task.verification.committee_size) {
    throw new EvidenceError("on-chain committee size differs");
  }

  // The submitted deliverable is this proof's.
  const deliverable = submittedDeliverable(proof);
  if (s.submitted === null) throw new EvidenceError("nothing was submitted for this job");
  if (s.submitted.deliverable !== deliverable) {
    throw new EvidenceError("the submitted deliverable is not this proof's");
  }

  // Votes: committee members only, once each; approvals name the submitted deliverable.
  const committee = new Set(s.config.committee.map((a) => a.toLowerCase()));
  const voted = new Set<string>();
  let approvals = 0;
  let rejections = 0;
  for (const v of s.votes) {
    const who = v.validator.toLowerCase();
    if (!committee.has(who))
      throw new EvidenceError(`vote from outside the committee: ${v.validator}`);
    if (voted.has(who)) throw new EvidenceError(`double vote: ${v.validator}`);
    voted.add(who);
    if (v.approve) {
      if (v.deliverable !== deliverable)
        throw new EvidenceError("an approval names another deliverable");
      approvals += 1;
    } else rejections += 1;
  }

  // A committee approval needs the threshold of approvals naming the deliverable.
  if (s.decided?.approved === true && approvals < task.verification.threshold) {
    throw new EvidenceError("decided approved without enough approvals");
  }
  if (s.settlement === null)
    return { outcome: "pending", approvals, rejections, overturned: false };
  if (s.finalized !== null && s.finalized.approved !== (s.settlement.outcome === "completed")) {
    throw new EvidenceError("finalization and settlement disagree");
  }
  // A settlement that differs from the committee's decision can only come from a ruled dispute.
  const overturned =
    s.decided !== null && s.decided.approved !== (s.settlement.outcome === "completed");
  return { outcome: s.settlement.outcome, approvals, rejections, overturned };
}
