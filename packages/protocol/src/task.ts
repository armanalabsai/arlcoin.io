// arl-task/1: the standard description of one agent-to-agent task (spec/arl-task/v0.1.0).
// A task names the work, how it is accepted, how it is paid and how it is verified. Its
// keccak256 over canonical JSON is the task hash. The bounds below mirror the deployed contracts
// (ARLJobs and ARLVerifiedEvaluator on Base Mainnet), so a task that parses can always be opened
// and configured on chain; nothing here changes what the contracts accept.

import type { Address, Hex } from "viem";

import { canonicalHash } from "./canonical.ts";

export const TASK_VERSION = "arl-task/1";

export const WORKLOAD_CLASSES = ["reexec", "attested", "model-assisted", "review"] as const;
export type WorkloadClass = (typeof WORKLOAD_CLASSES)[number];

export const TIERS = ["fallback", "reexecution", "attested"] as const;
export type Tier = (typeof TIERS)[number];

export const EVIDENCE_KINDS = [
  "result-manifest",
  "logs",
  "artifact",
  "attestation",
  "model-verdict",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const TOKENS = ["ARL", "USDC"] as const;
export type Token = (typeof TOKENS)[number];

/** Bounds of the deployed contracts and of this spec. */
export const BOUNDS = {
  /** ARLJobs.MIN_DURATION and MAX_DURATION, in hours (5 minutes rounds up to 1 hour). */
  deadlineHours: [1, 8760],
  /** ARLVerifiedEvaluator.MIN_VOTE_WINDOW / MAX_VOTE_WINDOW. */
  voteWindowSeconds: [600, 604_800],
  /** minChallengeWindow on Base Mainnet (86400) / MAX_CHALLENGE_WINDOW. */
  challengeWindowSeconds: [86_400, 2_592_000],
  /** ARLVerifiedEvaluator.MAX_COMMITTEE. */
  committeeSize: [1, 7],
  title: 120,
  description: 4000,
  acceptance: [1, 20],
  rule: 500,
  /** ARLJobs.MAX_DESCRIPTION, in UTF-8 bytes (the on-chain job description). */
  onchainDescription: 1024,
} as const;

export interface Workload {
  class: WorkloadClass;
  /** Where the workload spec lives (required for reexec: an arl-reexec/1 document). */
  spec_uri?: string;
  /** keccak256 of the canonical workload spec (required for reexec). */
  spec_hash?: Hex;
}

export interface AcceptanceRule {
  id: string;
  rule: string;
}

export interface Payment {
  token: Token;
  /** Budget in the token's base units, as a decimal string (no float, no sign). */
  budget: string;
  deadline_hours: number;
}

export interface Verification {
  /** The verification policy this task follows (arl-policy/1 id, Phase 2C). */
  policy: string;
  tier: Tier;
  committee_size: number;
  threshold: number;
  vote_window_seconds: number;
  challenge_window_seconds: number;
  /** Bond floor in ARL base units, decimal string; the contract takes max(floor, budget / 10). */
  bond_floor: string;
}

export interface Task {
  version: typeof TASK_VERSION;
  title: string;
  description: string;
  workload: Workload;
  acceptance: AcceptanceRule[];
  deliverable: { media_type: string; max_bytes?: number };
  payment: Payment;
  verification: Verification;
  evidence: EvidenceKind[];
}

export class TaskError extends Error {
  override name = "TaskError";
}

const HASH = /^0x[0-9a-f]{64}$/;
const DIGITS = /^(0|[1-9][0-9]*)$/;
const RULE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,62}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,62}$/;
const POLICY = /^arl-policy\/1:[a-z0-9][a-z0-9-]{0,47}$/;
const URL_SCHEMES = ["https:", "ipfs:"];
const UINT256_MAX = (1n << 256n) - 1n;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function onlyKeys(v: Record<string, unknown>, allowed: readonly string[], what: string): void {
  for (const k of Object.keys(v)) {
    if (!allowed.includes(k)) throw new TaskError(`${what}: unknown field ${k}`);
  }
}

function text(v: unknown, max: number, what: string, allowEmpty = false): string {
  if (typeof v !== "string") throw new TaskError(`${what} must be a string`);
  if (!allowEmpty && v.trim().length === 0) throw new TaskError(`${what} must not be empty`);
  if (v.length > max) throw new TaskError(`${what} must be at most ${max} characters`);
  return v;
}

function int(v: unknown, [min, max]: readonly [number, number], what: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) {
    throw new TaskError(`${what} must be an integer from ${min} to ${max}`);
  }
  return v;
}

function oneOf<T extends string>(v: unknown, values: readonly T[], what: string): T {
  if (typeof v !== "string" || !(values as readonly string[]).includes(v)) {
    throw new TaskError(`${what} must be one of ${values.join(", ")}`);
  }
  return v as T;
}

function amount(v: unknown, what: string, positive: boolean): string {
  if (typeof v !== "string" || !DIGITS.test(v)) {
    throw new TaskError(`${what} must be a decimal string of base units`);
  }
  const n = BigInt(v);
  if (n > UINT256_MAX) throw new TaskError(`${what} exceeds uint256`);
  if (positive && n === 0n) throw new TaskError(`${what} must be above zero`);
  return v;
}

function url(v: unknown, what: string): string {
  const s = text(v, 2048, what);
  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    throw new TaskError(`${what} is not a URL`);
  }
  if (!URL_SCHEMES.includes(parsed.protocol)) throw new TaskError(`${what} must be https or ipfs`);
  return s;
}

function workload(v: unknown): Workload {
  if (!isRecord(v)) throw new TaskError("workload must be an object");
  onlyKeys(v, ["class", "spec_uri", "spec_hash"], "workload");
  const cls = oneOf(v.class, WORKLOAD_CLASSES, "workload.class");
  const out: Workload = { class: cls };
  if (v.spec_uri !== undefined) out.spec_uri = url(v.spec_uri, "workload.spec_uri");
  if (v.spec_hash !== undefined) {
    if (typeof v.spec_hash !== "string" || !HASH.test(v.spec_hash)) {
      throw new TaskError("workload.spec_hash must be 0x and 64 lowercase hex");
    }
    out.spec_hash = v.spec_hash as Hex;
  }
  if ((out.spec_uri === undefined) !== (out.spec_hash === undefined)) {
    throw new TaskError("workload.spec_uri and workload.spec_hash go together");
  }
  if (cls === "reexec" && out.spec_hash === undefined) {
    throw new TaskError("a reexec workload needs spec_uri and spec_hash (an arl-reexec/1 spec)");
  }
  return out;
}

function acceptance(v: unknown): AcceptanceRule[] {
  if (!Array.isArray(v)) throw new TaskError("acceptance must be an array");
  const [min, max] = BOUNDS.acceptance;
  if (v.length < min || v.length > max) {
    throw new TaskError(`acceptance must have ${min} to ${max} rules`);
  }
  const ids = new Set<string>();
  return v.map((r, i) => {
    const what = `acceptance[${i}]`;
    if (!isRecord(r)) throw new TaskError(`${what} must be an object`);
    onlyKeys(r, ["id", "rule"], what);
    if (typeof r.id !== "string" || !RULE_ID.test(r.id)) {
      throw new TaskError(`${what}.id must be lowercase letters, digits and dashes`);
    }
    if (ids.has(r.id)) throw new TaskError(`${what}.id repeats ${r.id}`);
    ids.add(r.id);
    return { id: r.id, rule: text(r.rule, BOUNDS.rule, `${what}.rule`) };
  });
}

function verification(v: unknown, cls: WorkloadClass): Verification {
  if (!isRecord(v)) throw new TaskError("verification must be an object");
  onlyKeys(
    v,
    [
      "policy",
      "tier",
      "committee_size",
      "threshold",
      "vote_window_seconds",
      "challenge_window_seconds",
      "bond_floor",
    ],
    "verification",
  );
  if (typeof v.policy !== "string" || !POLICY.test(v.policy)) {
    throw new TaskError("verification.policy must be arl-policy/1:<id>");
  }
  const tier = oneOf(v.tier, TIERS, "verification.tier");
  const n = int(v.committee_size, BOUNDS.committeeSize, "verification.committee_size");
  const t = int(v.threshold, [1, n], "verification.threshold");
  // ARLVerifiedEvaluator._checkThreshold.
  if (tier === "fallback") {
    if (n !== 1 || t !== 1) throw new TaskError("a fallback tier is exactly 1 of 1");
  } else if (t < 2 || 2 * t <= n) {
    throw new TaskError("a checked tier needs a strict majority of at least 2");
  }
  if (cls === "reexec" && tier === "attested") {
    throw new TaskError("a reexec workload uses the reexecution or fallback tier");
  }
  if (cls === "attested" && tier === "reexecution") {
    throw new TaskError("an attested workload cannot be checked by re-execution");
  }
  return {
    policy: v.policy,
    tier,
    committee_size: n,
    threshold: t,
    vote_window_seconds: int(
      v.vote_window_seconds,
      BOUNDS.voteWindowSeconds,
      "verification.vote_window_seconds",
    ),
    challenge_window_seconds: int(
      v.challenge_window_seconds,
      BOUNDS.challengeWindowSeconds,
      "verification.challenge_window_seconds",
    ),
    bond_floor: amount(v.bond_floor, "verification.bond_floor", true),
  };
}

const TASK_KEYS = [
  "version",
  "title",
  "description",
  "workload",
  "acceptance",
  "deliverable",
  "payment",
  "verification",
  "evidence",
] as const;

/** Validates an untrusted task document and returns it typed. Unknown fields are refused. */
export function parseTask(raw: unknown): Task {
  if (!isRecord(raw)) throw new TaskError("task must be an object");
  onlyKeys(raw, TASK_KEYS, "task");
  if (raw.version !== TASK_VERSION) throw new TaskError(`version must be ${TASK_VERSION}`);

  const wl = workload(raw.workload);

  if (!isRecord(raw.deliverable)) throw new TaskError("deliverable must be an object");
  onlyKeys(raw.deliverable, ["media_type", "max_bytes"], "deliverable");
  const mt = raw.deliverable.media_type;
  if (typeof mt !== "string" || !MEDIA_TYPE.test(mt)) {
    throw new TaskError("deliverable.media_type must be a lowercase media type");
  }
  const deliverable: Task["deliverable"] = { media_type: mt };
  if (raw.deliverable.max_bytes !== undefined) {
    deliverable.max_bytes = int(
      raw.deliverable.max_bytes,
      [1, Number.MAX_SAFE_INTEGER],
      "deliverable.max_bytes",
    );
  }

  if (!isRecord(raw.payment)) throw new TaskError("payment must be an object");
  onlyKeys(raw.payment, ["token", "budget", "deadline_hours"], "payment");
  const payment: Payment = {
    token: oneOf(raw.payment.token, TOKENS, "payment.token"),
    budget: amount(raw.payment.budget, "payment.budget", true),
    deadline_hours: int(raw.payment.deadline_hours, BOUNDS.deadlineHours, "payment.deadline_hours"),
  };

  const ver = verification(raw.verification, wl.class);
  // ARLVerifiedEvaluator._checkWindows: the deadline must leave room for the vote window and two
  // challenge windows.
  const needed = ver.vote_window_seconds + 2 * ver.challenge_window_seconds;
  if (payment.deadline_hours * 3600 < needed) {
    throw new TaskError(
      `payment.deadline_hours must cover the vote window and two challenge windows (${Math.ceil(needed / 3600)} hours)`,
    );
  }

  if (!Array.isArray(raw.evidence) || raw.evidence.length === 0) {
    throw new TaskError("evidence must be a non-empty array");
  }
  const evidence = raw.evidence.map((e, i) => oneOf(e, EVIDENCE_KINDS, `evidence[${i}]`));
  if (new Set(evidence).size !== evidence.length) throw new TaskError("evidence repeats a kind");
  if (wl.class === "reexec" && !evidence.includes("result-manifest")) {
    throw new TaskError("a reexec workload requires result-manifest evidence");
  }
  if (wl.class === "attested" && !evidence.includes("attestation")) {
    throw new TaskError("an attested workload requires attestation evidence");
  }
  if (wl.class === "model-assisted" && !evidence.includes("model-verdict")) {
    throw new TaskError("a model-assisted workload requires model-verdict evidence");
  }

  return {
    version: TASK_VERSION,
    title: text(raw.title, BOUNDS.title, "title"),
    description: text(raw.description, BOUNDS.description, "description", true),
    workload: wl,
    acceptance: acceptance(raw.acceptance),
    deliverable,
    payment,
    verification: ver,
    evidence,
  };
}

/** keccak256 of the canonical task: the task hash. */
export function taskHash(task: Task): Hex {
  return canonicalHash(task);
}

/**
 * The value committed as `specHash` in `ARLVerifiedEvaluator.configure`: the workload spec hash
 * for a reexec task (validators re-run that spec, unchanged from arl-reexec/1), otherwise the task
 * hash.
 */
export function committedSpecHash(task: Task): Hex {
  return task.workload.class === "reexec" && task.workload.spec_hash !== undefined
    ? task.workload.spec_hash
    : taskHash(task);
}

/**
 * The on-chain job description: `arl-task:<task hash>` followed by the task's URI, so anyone can
 * fetch the task and check it against its hash. Must fit ARLJobs.MAX_DESCRIPTION.
 */
export function jobDescription(task: Task, taskUri: string): string {
  const s = `arl-task:${taskHash(task)} ${url(taskUri, "taskUri")}`;
  if (new TextEncoder().encode(s).length > BOUNDS.onchainDescription) {
    throw new TaskError("the task URI is too long for the on-chain description");
  }
  return s;
}

/** Arguments for ARLJobs.createJob and the Config of ARLVerifiedEvaluator.configure. */
export interface OnchainTerms {
  createJob: {
    provider: Address;
    evaluator: Address;
    expiredAt: bigint;
    description: string;
    hook: Address;
  };
  configure: {
    tier: number;
    threshold: number;
    voteWindow: bigint;
    challengeWindow: bigint;
    bond: bigint;
    providerAgentId: bigint;
    specHash: Hex;
    committee: Address[];
  };
  budget: bigint;
}

const TIER_INDEX: Record<Tier, number> = { fallback: 0, reexecution: 1, attested: 2 };

/**
 * Maps a parsed task to the contract calls (pure: no chain access). `now` is the chain time in
 * seconds. The committee is proposed by the client; it must not contain the client or provider.
 */
export function onchainTerms(
  task: Task,
  opts: {
    client: Address;
    provider: Address;
    evaluator: Address;
    committee: Address[];
    taskUri: string;
    now: bigint;
    providerAgentId?: bigint;
  },
): OnchainTerms {
  const lower = (a: string) => a.toLowerCase();
  if (opts.committee.length !== task.verification.committee_size) {
    throw new TaskError("committee size differs from the task");
  }
  const seen = new Set<string>();
  for (const m of opts.committee) {
    const k = lower(m);
    if (k === lower(opts.client) || k === lower(opts.provider)) {
      throw new TaskError("the committee must not contain the client or the provider");
    }
    if (seen.has(k)) throw new TaskError("the committee repeats a member");
    seen.add(k);
  }
  return {
    createJob: {
      provider: opts.provider,
      evaluator: opts.evaluator,
      expiredAt: opts.now + BigInt(task.payment.deadline_hours) * 3600n,
      description: jobDescription(task, opts.taskUri),
      hook: "0x0000000000000000000000000000000000000000",
    },
    configure: {
      tier: TIER_INDEX[task.verification.tier],
      threshold: task.verification.threshold,
      voteWindow: BigInt(task.verification.vote_window_seconds),
      challengeWindow: BigInt(task.verification.challenge_window_seconds),
      bond: BigInt(task.verification.bond_floor),
      providerAgentId: opts.providerAgentId ?? 0n,
      specHash: committedSpecHash(task),
      committee: [...opts.committee],
    },
    budget: BigInt(task.payment.budget),
  };
}
