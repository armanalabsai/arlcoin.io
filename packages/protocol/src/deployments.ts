// Where an arl-task/1 task is opened: the jobs escrow and verified evaluator for each payment token
// on Base Mainnet (docs/mainnet-services.md). One place to change when the escrows are redeployed.

import type { Address } from "viem";

import type { Token } from "./task.ts";

export interface TaskDeployment {
  chainId: number;
  /** The token the escrow is paid in. */
  token: Address;
  /** ARLJobs paid in `token`. */
  jobs: Address;
  /** ARLVerifiedEvaluator bound to `jobs`. */
  evaluator: Address;
  /** The evaluator's arbiter (the Arbiter Safe); it may not be client, provider or member. */
  arbiter: Address;
}

const ARBITER_SAFE: Address = "0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f";

/** Base Mainnet: escrows v2 (nonces 22 and 23) and evaluators v4 (nonces 29 and 30). */
export const BASE_MAINNET_TASK_DEPLOYMENTS: Record<Token, TaskDeployment> = {
  ARL: {
    chainId: 8453,
    token: "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4",
    jobs: "0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9",
    evaluator: "0x5cA6dab18E6b9a5Cd44a4FfFBdf2c5BA3Cd87DfF",
    arbiter: ARBITER_SAFE,
  },
  USDC: {
    chainId: 8453,
    token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    jobs: "0xc833140D2eE8607fd41662cffFAc557f3D535bE6",
    evaluator: "0x8C017f24615AC749Ec7297FB07b14E558B670CFC",
    arbiter: ARBITER_SAFE,
  },
};

/** The deployment a task paid in `token` uses on `chainId`, or undefined (local chains). */
export function taskDeployment(chainId: number, token: Token): TaskDeployment | undefined {
  return chainId === 8453 ? BASE_MAINNET_TASK_DEPLOYMENTS[token] : undefined;
}
