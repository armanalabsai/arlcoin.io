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
