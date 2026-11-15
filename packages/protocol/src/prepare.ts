// Turns an arl-task/1 task into the unsigned transactions that open it on chain, for the client's
// own wallet to sign (SDK openTask, the MCP server, AgentKit). Pure: no chain access, no keys.
//
//   1. createJob on the jobs escrow (the job id comes from its JobCreated event), then
//   2. configure on the evaluator, setBudget, approve the escrow for the budget, and fund.
//
// The provider then approves the committee (approveCommittee) and the members accept.

import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";

import type { TaskDeployment } from "./deployments.ts";
import { builtinPolicy } from "./policies.ts";
import { checkTaskAgainstPolicy, type Policy } from "./policy.ts";
import {
  TaskError,
  onchainTerms,
  parseTask,
  taskHash,
  type OnchainTerms,
  type Task,
} from "./task.ts";

export const openTaskAbi = parseAbi([
  "function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256)",
  "function setBudget(uint256 jobId, uint256 amount, bytes optParams)",
  "function fund(uint256 jobId, uint256 expectedBudget, bytes optParams)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "struct Config { uint8 tier; uint8 threshold; uint64 voteWindow; uint64 challengeWindow; uint96 bond; uint256 providerAgentId; bytes32 specHash; address[] committee; }",
  "function configure(uint256 jobId, Config cfg)",
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
]);

export type OpenStep = "createJob" | "configure" | "setBudget" | "approve" | "fund";

/** One transaction for the client's wallet: send `data` to `to` with no value. */
export interface UnsignedTx {
  step: OpenStep;
  to: Address;
  data: Hex;
  value: "0";
}

export interface PrepareTaskInput {
  /** The task document (untrusted: it is validated here). */
  task: unknown;
  /** Where anyone can fetch the task (https or ipfs); goes into the on-chain description. */
  taskUri: string;
  /** The wallet that signs and pays: the job's client. */
  client: Address;
  provider: Address;
  /** Staked validators, as many as the task's committee_size. */
  committee: Address[];
  /** The escrow and evaluator for the task's payment token. */
  deployment: TaskDeployment;
  /** Chain time in seconds (latest block). */
  now: bigint;
  /** The policy the task names; the built-in policies are used when it is omitted. */
  policy?: Policy;
  providerAgentId?: bigint;
}

export interface PreparedTask {
  task: Task;
  taskHash: Hex;
  policy: Policy;
  terms: OnchainTerms;
  deployment: TaskDeployment;
  /** Step 1. */
  create: UnsignedTx;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Validates the task, checks it against its policy and against the deployment's arbiter, and
 * returns the terms and the createJob transaction. Throws TaskError or PolicyError.
 */
export function prepareTask(input: PrepareTaskInput): PreparedTask {
  const task = parseTask(input.task);
  const policy = input.policy ?? builtinPolicy(task.verification.policy);
  if (!policy) {
    throw new TaskError(`unknown policy ${task.verification.policy}: pass the policy document`);
  }
  checkTaskAgainstPolicy(task, policy);
  const d = input.deployment;
  // ARLVerifiedEvaluator refuses these (ConflictOfInterest); checking first avoids a created job
  // that can never be configured.
  const arbiter = d.arbiter;
  if (same(input.client, arbiter) || same(input.provider, arbiter)) {
    throw new TaskError("the arbiter cannot be the client or the provider");
  }
  if (input.committee.some((m) => same(m, arbiter))) {
    throw new TaskError("the arbiter cannot be a committee member");
  }
  if (same(input.client, input.provider)) throw new TaskError("the client cannot be the provider");
  const terms = onchainTerms(task, {
    client: input.client,
    provider: input.provider,
    evaluator: d.evaluator,
    committee: input.committee,
    taskUri: input.taskUri,
    now: input.now,
    ...(input.providerAgentId === undefined ? {} : { providerAgentId: input.providerAgentId }),
  });
  const c = terms.createJob;
  return {
    task,
    taskHash: taskHash(task),
    policy,
    terms,
    deployment: d,
    create: {
      step: "createJob",
      to: d.jobs,
      data: encodeFunctionData({
        abi: openTaskAbi,
        functionName: "createJob",
        args: [c.provider, c.evaluator, c.expiredAt, c.description, c.hook],
      }),
      value: "0",
    },
  };
}

/** Step 2, once createJob is mined and its JobCreated event gave `jobId`. */
export function fundingTransactions(prepared: PreparedTask, jobId: bigint): UnsignedTx[] {
  const { terms, deployment: d } = prepared;
  const tx = (step: OpenStep, to: Address, data: Hex): UnsignedTx => ({
    step,
    to,
    data,
    value: "0",
  });
  return [
    tx(
      "configure",
      d.evaluator,
      encodeFunctionData({
        abi: openTaskAbi,
        functionName: "configure",
        args: [jobId, terms.configure],
      }),
    ),
    tx(
      "setBudget",
      d.jobs,
      encodeFunctionData({
        abi: openTaskAbi,
        functionName: "setBudget",
        args: [jobId, terms.budget, "0x"],
      }),
    ),
    tx(
      "approve",
      d.token,
      encodeFunctionData({
        abi: openTaskAbi,
        functionName: "approve",
        args: [d.jobs, terms.budget],
      }),
    ),
    tx(
      "fund",
      d.jobs,
      encodeFunctionData({
        abi: openTaskAbi,
        functionName: "fund",
        args: [jobId, terms.budget, "0x"],
      }),
    ),
  ];
}
