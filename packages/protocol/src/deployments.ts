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
    jobs: "0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC",
    evaluator: "0xcF87CF8751648919b5A7F3b45795999dFDeE5861",
    arbiter: ARBITER_SAFE,
  },
  USDC: {
    chainId: 8453,
    token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    jobs: "0xE3eA0EAEc3Cf9DA2d0856A0f784A4B1671AeFD04",
    evaluator: "0xc121c4fE9460c55d85dE0175C1C7045235f94c07",
    arbiter: ARBITER_SAFE,
  },
};

/** The deployment a task paid in `token` uses on `chainId`, or undefined (local chains). */
export function taskDeployment(chainId: number, token: Token): TaskDeployment | undefined {
  return chainId === 8453 ? BASE_MAINNET_TASK_DEPLOYMENTS[token] : undefined;
}
