// arl-policy/1: verification policies (spec/arl-policy/v0.1.0). A policy fixes, per workload
// class, how a task is checked: tier and committee shape, windows, bond sizing, required evidence,
// whether a model verdict is admissible and up to which budget, and how a validator turns its own
// checks into a vote. Contract-enforced bounds stay in the contract; the rest is validator duty,
// backed by bonds and disputes.

import { canonicalHash } from "./canonical.ts";
import type { Hex } from "viem";
import {
  BOUNDS,
  EVIDENCE_KINDS,
  TIERS,
  TOKENS,
  WORKLOAD_CLASSES,
  type EvidenceKind,
  type Task,
  type Tier,
  type Token,
  type WorkloadClass,
} from "./task.ts";

export const POLICY_VERSION = "arl-policy/1";

export interface ModelAllowance {
  /** Whether a model verdict may decide a rule (still as a validator's vote). */
  allowed: boolean;
  /** Highest budget, per token in base units, for which a model verdict may decide a rule. */
  max_budget: Partial<Record<Token, string>>;
  /** Models a validator may use: name and SHA-256 of the weights. Empty: any pinned model. */
  models: { name: string; weights_sha256: string }[];
}

export interface Policy {
  version: typeof POLICY_VERSION;
  id: string;
  workload_classes: WorkloadClass[];
  tiers: Tier[];
  committee: { min_size: number; max_size: number };
  vote_window_seconds: [number, number];
  challenge_window_seconds: [number, number];
  /** Minimum bond floor, per token the task is paid in, in ARL base units. */
  min_bond_floor: string;
  /**
   * ARL tasks only: the committee's total bond at risk (threshold × max(floor, budget / 10)) must
   * cover the budget. USDC tasks are bonded in ARL, so the rule needs a price and is not applied.
   */
  bond_covers_budget: boolean;
  required_evidence: EvidenceKind[];
  model: ModelAllowance;
}

export class PolicyError extends Error {
  override name = "PolicyError";
}

const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const DIGITS = /^(0|[1-9][0-9]*)$/;
const SHA256 = /^[0-9a-f]{64}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function onlyKeys(v: Record<string, unknown>, allowed: readonly string[], what: string): void {
  for (const k of Object.keys(v)) {
    if (!allowed.includes(k)) throw new PolicyError(`${what}: unknown field ${k}`);
  }
}

function list<T extends string>(
  v: unknown,
  values: readonly T[],
  what: string,
  nonEmpty = true,
): T[] {
  if (!Array.isArray(v) || (nonEmpty && v.length === 0)) {
    throw new PolicyError(`${what} must be a${nonEmpty ? " non-empty" : "n"} array`);
  }
  const out = v.map((x, i) => {
    if (typeof x !== "string" || !(values as readonly string[]).includes(x)) {
      throw new PolicyError(`${what}[${i}] must be one of ${values.join(", ")}`);
    }
    return x as T;
  });
  if (new Set(out).size !== out.length) throw new PolicyError(`${what} repeats a value`);
  return out;
}

function range(v: unknown, [lo, hi]: readonly [number, number], what: string): [number, number] {
  if (
    !Array.isArray(v) ||
    v.length !== 2 ||
    !v.every((x) => typeof x === "number" && Number.isSafeInteger(x)) ||
    (v[0] as number) < lo ||
    (v[1] as number) > hi ||
    (v[0] as number) > (v[1] as number)
  ) {
    throw new PolicyError(`${what} must be [min, max] within ${lo}..${hi}`);
  }
  return [v[0] as number, v[1] as number];
}

function digits(v: unknown, what: string): string {
  if (typeof v !== "string" || !DIGITS.test(v))
    throw new PolicyError(`${what} must be a decimal string`);
  return v;
}

/** Validates an untrusted policy document. Unknown fields are refused. */
export function parsePolicy(raw: unknown): Policy {
  if (!isRecord(raw)) throw new PolicyError("policy must be an object");
  onlyKeys(
    raw,
    [
      "version",
      "id",
      "workload_classes",
      "tiers",
      "committee",
      "vote_window_seconds",
      "challenge_window_seconds",
      "min_bond_floor",
      "bond_covers_budget",
      "required_evidence",
      "model",
    ],
    "policy",
  );
  if (raw.version !== POLICY_VERSION) throw new PolicyError(`version must be ${POLICY_VERSION}`);
  if (typeof raw.id !== "string" || !ID.test(raw.id))
    throw new PolicyError("id must be lowercase letters, digits and dashes");
  const classes = list(raw.workload_classes, WORKLOAD_CLASSES, "workload_classes");
  const tiers = list(raw.tiers, TIERS, "tiers");

  if (!isRecord(raw.committee)) throw new PolicyError("committee must be an object");
  onlyKeys(raw.committee, ["min_size", "max_size"], "committee");
  const [minSize, maxSize] = range(
    [raw.committee.min_size, raw.committee.max_size],
    BOUNDS.committeeSize,
    "committee",
  );

  if (typeof raw.bond_covers_budget !== "boolean")
    throw new PolicyError("bond_covers_budget must be a boolean");

  if (!isRecord(raw.model)) throw new PolicyError("model must be an object");
  onlyKeys(raw.model, ["allowed", "max_budget", "models"], "model");
  if (typeof raw.model.allowed !== "boolean")
    throw new PolicyError("model.allowed must be a boolean");
  if (!isRecord(raw.model.max_budget)) throw new PolicyError("model.max_budget must be an object");
  const maxBudget: Partial<Record<Token, string>> = {};
  for (const [k, v] of Object.entries(raw.model.max_budget)) {
    if (!(TOKENS as readonly string[]).includes(k))
      throw new PolicyError(`model.max_budget: unknown token ${k}`);
    maxBudget[k as Token] = digits(v, `model.max_budget.${k}`);
  }
  if (!Array.isArray(raw.model.models)) throw new PolicyError("model.models must be an array");
  const models = raw.model.models.map((m, i) => {
    if (!isRecord(m)) throw new PolicyError(`model.models[${i}] must be an object`);
    onlyKeys(m, ["name", "weights_sha256"], `model.models[${i}]`);
    if (typeof m.name !== "string" || m.name.trim() === "")
      throw new PolicyError(`model.models[${i}].name must be a string`);
    if (typeof m.weights_sha256 !== "string" || !SHA256.test(m.weights_sha256)) {
      throw new PolicyError(`model.models[${i}].weights_sha256 must be 64 lowercase hex`);
    }
    return { name: m.name, weights_sha256: m.weights_sha256 };
  });
  if (raw.model.allowed && Object.keys(maxBudget).length === 0) {
    throw new PolicyError("a policy that allows model verdicts must cap the budget");
  }
  if (classes.includes("reexec") && raw.model.allowed) {
    throw new PolicyError("reexec policies decide by re-execution, not by a model");
  }

  return {
    version: POLICY_VERSION,
    id: raw.id,
    workload_classes: classes,
    tiers,
    committee: { min_size: minSize, max_size: maxSize },
    vote_window_seconds: range(
      raw.vote_window_seconds,
      BOUNDS.voteWindowSeconds,
      "vote_window_seconds",
    ),
    challenge_window_seconds: range(
      raw.challenge_window_seconds,
      BOUNDS.challengeWindowSeconds,
      "challenge_window_seconds",
    ),
    min_bond_floor: digits(raw.min_bond_floor, "min_bond_floor"),
    bond_covers_budget: raw.bond_covers_budget,
    required_evidence: list(raw.required_evidence, EVIDENCE_KINDS, "required_evidence", false),
    model: { allowed: raw.model.allowed, max_budget: maxBudget, models },
  };
}

export function policyHash(policy: Policy): Hex {
  return canonicalHash(policy);
}

/** The bond each accepted member locks: ARLVerifiedEvaluator takes max(floor, budget / 10). */
export function effectiveBond(task: Task): bigint {
  const floor = BigInt(task.verification.bond_floor);
  const tenth = BigInt(task.payment.budget) / 10n;
  return floor > tenth ? floor : tenth;
}

/** Checks that a task follows the policy it names. Throws PolicyError with the first violation. */
export function checkTaskAgainstPolicy(task: Task, policy: Policy): void {
  const v = task.verification;
  if (v.policy !== `${POLICY_VERSION}:${policy.id}`)
    throw new PolicyError("the task names another policy");
  if (!policy.workload_classes.includes(task.workload.class)) {
    throw new PolicyError(`workload class ${task.workload.class} is not covered by this policy`);
  }
  if (!policy.tiers.includes(v.tier))
    throw new PolicyError(`tier ${v.tier} is not allowed by this policy`);
  if (
    v.committee_size < policy.committee.min_size ||
    v.committee_size > policy.committee.max_size
  ) {
    throw new PolicyError(
      `committee size must be ${policy.committee.min_size} to ${policy.committee.max_size}`,
    );
  }
  const [vlo, vhi] = policy.vote_window_seconds;
  if (v.vote_window_seconds < vlo || v.vote_window_seconds > vhi)
    throw new PolicyError("vote window outside the policy");
  const [clo, chi] = policy.challenge_window_seconds;
  if (v.challenge_window_seconds < clo || v.challenge_window_seconds > chi) {
    throw new PolicyError("challenge window outside the policy");
  }
  if (BigInt(v.bond_floor) < BigInt(policy.min_bond_floor))
    throw new PolicyError("bond floor below the policy minimum");
  if (policy.bond_covers_budget && task.payment.token === "ARL") {
    if (BigInt(v.threshold) * effectiveBond(task) < BigInt(task.payment.budget)) {
      throw new PolicyError("threshold × bond does not cover the budget");
    }
  }
  for (const k of policy.required_evidence) {
    if (!task.evidence.includes(k)) throw new PolicyError(`the policy requires ${k} evidence`);
  }
}

/** How a validator established one acceptance rule. */
export interface RuleOutcome {
  id: string;
  passed: boolean;
  /** "check": the validator's own deterministic check or review; "model": a model verdict. */
  by: "check" | "model";
  /** For "model": the SHA-256 of the weights used. */
  weights_sha256?: string;
}

export interface VoteDecision {
  approve: boolean;
  reason: string;
}

/**
 * Turns a validator's outcomes into its vote. Approve only if every acceptance rule of the task
 * has an admissible passing outcome. A model outcome is admissible only if the policy allows
 * models, the budget is within the policy's cap for the token, and (when the policy lists models)
 * the weights are listed. Anything missing or inadmissible is a reject, never an approve.
 */
export function decideVote(task: Task, policy: Policy, outcomes: RuleOutcome[]): VoteDecision {
  const byId = new Map(outcomes.map((o) => [o.id, o]));
  for (const rule of task.acceptance) {
    const o = byId.get(rule.id);
    if (o === undefined) return { approve: false, reason: `no outcome for rule ${rule.id}` };
    if (o.by === "model") {
      if (!policy.model.allowed)
        return { approve: false, reason: `rule ${rule.id}: model verdicts are not admissible` };
      const cap = policy.model.max_budget[task.payment.token];
      if (cap === undefined || BigInt(task.payment.budget) > BigInt(cap)) {
        return { approve: false, reason: `rule ${rule.id}: budget above the model cap` };
      }
      if (
        policy.model.models.length > 0 &&
        !policy.model.models.some((m) => m.weights_sha256 === o.weights_sha256)
      ) {
        return {
          approve: false,
          reason: `rule ${rule.id}: model weights not allowed by the policy`,
        };
      }
    }
    if (!o.passed) return { approve: false, reason: `rule ${rule.id} failed` };
  }
  return { approve: true, reason: "every acceptance rule passed" };
}
