// Open an arl-task/1 task (spec/arl-task/v0.1.0) as a verified job, paid and checked as the task
// says:
//
//   const { jobId, taskHash } = await openTask(clients, task, {
//     taskUri: "https://…/task.json", provider, committee: [v1, v2, v3] });
//
// The task is validated and checked against its arl-policy/1 policy before any transaction. Then
// the wallet (the job's client) creates the job, configures the committee, sets the budget,
// approves the escrow and funds it. The provider approves the committee next; the members accept
// and vote. Every transaction is the one `prepareTask` / `fundingTransactions` return, so wallets
// that cannot use this SDK (MCP, AgentKit) sign exactly the same calls.

import { parseEventLogs, type Address, type Hash, type Hex, type WalletClient } from "viem";

import {
  fundingTransactions,
  openTaskAbi,
  prepareTask,
  taskDeployment,
  type Policy,
  type TaskDeployment,
  type UnsignedTx,
} from "../../protocol/src/index.ts";
import {
  VerifiedJobError,
  checkVerifiedChain,
  walletAccount,
  type VerifiedClients,
} from "./verified.ts";

export interface OpenTaskOptions {
  /** Where anyone can fetch the task document (https or ipfs). */
  taskUri: string;
  provider: Address;
  /** Staked validators, as many as the task's committee_size. */
  committee: Address[];
  /** The task's policy, when it is not one of the built-in policies. */
  policy?: Policy;
  providerAgentId?: bigint;
  /** Required on a local chain; on Base Mainnet the deployment for the task's token is used. */
  deployment?: TaskDeployment;
}

export interface OpenedTask {
  jobId: bigint;
  taskHash: Hex;
  /** Transaction hashes, by step. */
  txs: Record<UnsignedTx["step"], Hash>;
}

const readAbi = [
  {
    type: "function",
    name: "paymentToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Validates `task`, then opens and funds it as a verified job from the wallet's account. */
export async function openTask(
  { publicClient, walletClient }: VerifiedClients,
  task: unknown,
  opts: OpenTaskOptions,
): Promise<OpenedTask> {
  const from = walletAccount(walletClient);
  const chainId = await checkVerifiedChain(publicClient);
  const token = (task as { payment?: { token?: unknown } } | null)?.payment?.token;
  const known = token === "ARL" || token === "USDC" ? taskDeployment(chainId, token) : undefined;
  if (opts.deployment && known && opts.deployment.jobs.toLowerCase() !== known.jobs.toLowerCase()) {
    throw new VerifiedJobError("on Base Mainnet the task opens on ARL's own escrow");
  }
  const deployment = opts.deployment ?? known;
  const { timestamp } = await publicClient.getBlock();
  // Throws TaskError or PolicyError; nothing has been sent yet.
  const prepared = prepareTask({
    task,
    taskUri: opts.taskUri,
    client: from.address,
    provider: opts.provider,
    committee: opts.committee,
    deployment: deployment ?? missingDeployment(),
    now: timestamp,
    ...(opts.policy ? { policy: opts.policy } : {}),
    ...(opts.providerAgentId === undefined ? {} : { providerAgentId: opts.providerAgentId }),
  });
  const d = prepared.deployment;
  if (d.chainId !== chainId) throw new VerifiedJobError("the deployment is for another chain");
  for (const [a, what] of [
    [d.jobs, "jobs escrow"],
    [d.evaluator, "evaluator"],
    [d.token, "token"],
  ] as const) {
    const code = await publicClient.getCode({ address: a });
    if (code === undefined || code === "0x") {
      throw new VerifiedJobError(`${what} ${a} has no code on this chain`);
    }
  }
  const paidIn = await publicClient.readContract({
    address: d.jobs,
    abi: readAbi,
    functionName: "paymentToken",
  });
  if (paidIn.toLowerCase() !== d.token.toLowerCase()) {
    throw new VerifiedJobError("the escrow is paid in another token than the deployment says");
  }
  const balance = await publicClient.readContract({
    address: d.token,
    abi: readAbi,
    functionName: "balanceOf",
    args: [from.address],
  });
  if (balance < prepared.terms.budget) {
    throw new VerifiedJobError(
      `the client holds less ${prepared.task.payment.token} than the budget`,
    );
  }

  // One signature for both wallet client shapes VerifiedClients allows.
  const wallet: WalletClient = walletClient;
  const send = async (tx: UnsignedTx): Promise<Hash> => {
    const hash = await wallet.sendTransaction({
      account: from,
      chain: walletClient.chain,
      to: tx.to,
      data: tx.data,
      value: 0n,
    } as never);
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new VerifiedJobError(`${tx.step} reverted`);
    return hash;
  };

  const createJob = await send(prepared.create);
  const receipt = await publicClient.getTransactionReceipt({ hash: createJob });
  const created = parseEventLogs({
    abi: openTaskAbi,
    eventName: "JobCreated",
    logs: receipt.logs,
  }).find((l) => l.address.toLowerCase() === d.jobs.toLowerCase());
  if (!created) throw new VerifiedJobError("JobCreated event missing");
  const jobId = created.args.jobId;

  const txs = { createJob } as OpenedTask["txs"];
  for (const tx of fundingTransactions(prepared, jobId)) txs[tx.step] = await send(tx);
  return { jobId, taskHash: prepared.taskHash, txs };
}

function missingDeployment(): never {
  throw new VerifiedJobError("deployment is required on this chain");
}
