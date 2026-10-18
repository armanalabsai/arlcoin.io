// The verified evaluator on Base Sepolia (contracts/deploy/base-sepolia.json, verifiedEvaluator):
// a staked validator committee that acts as the evaluator of ERC-8183 jobs, with a challenge
// window and a 2-of-3 arbiter Safe for disputed jobs (docs/verifiable-execution.md). Only the
// functions the app reads or calls are listed here.

import type { Address } from "viem";

export const EVALUATOR: Address = "0x6808F80Eb11538543d31cf4b50332B268dDd4d14";
export const ARBITER_SAFE: Address = "0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f";
export const EXPLORER = "https://base-sepolia.blockscout.com";

export const PHASES = [
  "Not configured",
  "Configured",
  "Approved",
  "Rejected",
  "Disputed",
  "Finalized",
  "Released",
  "Failed",
] as const;

export const TIERS = ["Fallback", "Re-execution", "Attested"] as const;

/** The verdict phase as text; unknown values are shown as numbers. */
export function phaseName(phase: number): string {
  return PHASES[phase] ?? `Phase ${String(phase)}`;
}

export const evaluatorAbi = [
  {
    type: "function",
    name: "stakeOf",
    stateMutability: "view",
    inputs: [{ name: "validator", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "lockedOf",
    stateMutability: "view",
    inputs: [{ name: "validator", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "minChallengeWindow",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "minBond",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint96" }],
  },
  {
    type: "function",
    name: "stake",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "unstake",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "finalize",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getConfig",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "tier", type: "uint8" },
          { name: "threshold", type: "uint8" },
          { name: "voteWindow", type: "uint64" },
          { name: "challengeWindow", type: "uint64" },
          { name: "bond", type: "uint96" },
          { name: "providerAgentId", type: "uint256" },
          { name: "specHash", type: "bytes32" },
          { name: "committee", type: "address[]" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getVerdict",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "phase", type: "uint8" },
          { name: "providerApproved", type: "bool" },
          { name: "approvals", type: "uint8" },
          { name: "rejections", type: "uint8" },
          { name: "voteEnds", type: "uint64" },
          { name: "challengeEnds", type: "uint64" },
          { name: "challenger", type: "address" },
          { name: "bond", type: "uint256" },
          { name: "deliverable", type: "bytes32" },
          { name: "voteHash", type: "bytes32" },
        ],
      },
    ],
  },
] as const;

/** The block the evaluator was deployed in: its event history starts there. */
export const EVALUATOR_DEPLOY_BLOCK = 48_277_116n;

/** Events the public statistics are counted from. */
export const evaluatorEvents = [
  {
    type: "event",
    name: "Configured",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "tier", type: "uint8", indexed: false },
      { name: "threshold", type: "uint8", indexed: false },
      { name: "voteWindow", type: "uint64", indexed: false },
      { name: "challengeWindow", type: "uint64", indexed: false },
      { name: "bond", type: "uint96", indexed: false },
      { name: "providerAgentId", type: "uint256", indexed: false },
      { name: "specHash", type: "bytes32", indexed: false },
      { name: "committee", type: "address[]", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Finalized",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "approved", type: "bool", indexed: false },
      { name: "voteHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Staked",
    inputs: [
      { name: "validator", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Unstaked",
    inputs: [
      { name: "validator", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Slashed",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Disputed",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "challenger", type: "address", indexed: true },
      { name: "evidence", type: "bytes32", indexed: false },
    ],
  },
] as const;

export interface EvaluatorStats {
  jobs: number;
  approved: number;
  rejected: number;
  disputes: number;
  validators: number;
  staked: bigint;
  slashed: bigint;
}

type StatLog =
  | { eventName: "Configured" }
  | { eventName: "Finalized"; args: { approved?: boolean } }
  | { eventName: "Staked" | "Unstaked"; args: { validator?: string; amount?: bigint } }
  | { eventName: "Slashed"; args: { amount?: bigint } }
  | { eventName: "Disputed" };

/** Counts the network's activity from its events (staked = staked − unstaked − slashed). */
export function countStats(logs: readonly StatLog[]): EvaluatorStats {
  const s: EvaluatorStats = {
    jobs: 0,
    approved: 0,
    rejected: 0,
    disputes: 0,
    validators: 0,
    staked: 0n,
    slashed: 0n,
  };
  const stakeOf = new Map<string, bigint>();
  for (const l of logs) {
    switch (l.eventName) {
      case "Configured":
        s.jobs += 1;
        break;
      case "Finalized":
        if (l.args.approved) s.approved += 1;
        else s.rejected += 1;
        break;
      case "Staked":
      case "Unstaked": {
        const who = (l.args.validator ?? "").toLowerCase();
        const sign = l.eventName === "Staked" ? 1n : -1n;
        stakeOf.set(who, (stakeOf.get(who) ?? 0n) + sign * (l.args.amount ?? 0n));
        s.staked += sign * (l.args.amount ?? 0n);
        break;
      }
      case "Slashed":
        s.slashed += l.args.amount ?? 0n;
        s.staked -= l.args.amount ?? 0n;
        break;
      case "Disputed":
        s.disputes += 1;
        break;
    }
  }
  s.validators = [...stakeOf.values()].filter((v) => v > 0n).length;
  return s;
}
