// ARL escrowed jobs (ERC-8183) on Base Mainnet, in the few calls an n8n workflow needs: create a
// job, agree a budget, fund it, hand in the work, and settle it (complete, reject or refund).
// Amounts are plain numbers in token units ("10" is 10 ARL); approvals happen automatically.

import {
  formatUnits,
  getAddress,
  isAddress,
  isHex,
  keccak256,
  parseAbi,
  parseEventLogs,
  parseUnits,
  stringToHex,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";

import { openTask } from "../../sdk/src/openTask.ts";

/** The ARL escrows on Base Mainnet (contracts/deploy/base-mainnet-jobs.json). */
export const ESCROWS = {
  ARL: "0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC",
  USDC: "0xE3eA0EAEc3Cf9DA2d0856A0f784A4B1671AeFD04",
} as const satisfies Record<string, Address>;

export type Escrow = keyof typeof ESCROWS;

export const BASE_MAINNET_CHAIN_ID = 8453;

export const STATUS = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"] as const;

export const jobsAbi = parseAbi([
  "struct Job { uint256 id; address client; address provider; address evaluator; string description; uint256 budget; uint256 expiredAt; uint8 status; address hook; }",
  "function paymentToken() view returns (address)",
  "function getJob(uint256 jobId) view returns (Job)",
  "function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256)",
  "function setBudget(uint256 jobId, uint256 amount, bytes optParams)",
  "function fund(uint256 jobId, uint256 expectedBudget, bytes optParams)",
  "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
  "function complete(uint256 jobId, bytes32 reason, bytes optParams)",
  "function reject(uint256 jobId, bytes32 reason, bytes optParams)",
  "function claimRefund(uint256 jobId)",
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
]);

export const erc20Abi = parseAbi([
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export interface Clients {
  publicClient: PublicClient;
  walletClient: WalletClient;
}

export class ArlJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArlJobError";
  }
}

/** A text becomes its keccak256 hash; a 32-byte hex value is used as it is. */
export function toBytes32(value: string): Hex {
  const v = value.trim();
  if (isHex(v) && v.length === 66) return v;
  if (v === "") throw new ArlJobError("the deliverable or reason is empty");
  return keccak256(stringToHex(v));
}

export function checkAddress(value: string, what: string): Address {
  const v = value.trim();
  if (!isAddress(v, { strict: false })) throw new ArlJobError(`${what} is not an address: ${v}`);
  return getAddress(v);
}

export function parseAmount(value: string | number, decimals: number): bigint {
  const v = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(v)) throw new ArlJobError(`not a positive amount: ${v}`);
  const amount = parseUnits(v, decimals);
  if (amount === 0n) throw new ArlJobError("the amount must be above zero");
  return amount;
}

export function parseJobId(value: string | number): bigint {
  const v = String(value).trim();
  if (!/^\d+$/.test(v) || v === "0") throw new ArlJobError(`not a job id: ${v}`);
  return BigInt(v);
}

function sender(c: Clients): Address {
  const account = c.walletClient.account;
  if (!account) throw new ArlJobError("the wallet credential has no account");
  return account.address;
}

async function checkChain(c: Clients): Promise<void> {
  const id = await c.publicClient.getChainId();
  if (id !== BASE_MAINNET_CHAIN_ID)
    throw new ArlJobError(`the RPC serves chain ${String(id)}, not Base Mainnet (8453)`);
}

async function send(
  c: Clients,
  escrow: Address,
  functionName: "setBudget" | "fund" | "submit" | "complete" | "reject" | "claimRefund",
  args: readonly unknown[],
): Promise<Hash> {
  const { request } = await c.publicClient.simulateContract({
    address: escrow,
    abi: jobsAbi,
    functionName,
    args: args as never,
    account: sender(c),
  });
  const hash = await c.walletClient.writeContract(request as never);
  const receipt = await c.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new ArlJobError(`transaction ${hash} reverted`);
  return hash;
}

async function decimalsOf(c: Clients, escrow: Address): Promise<number> {
  const token = await c.publicClient.readContract({
    address: escrow,
    abi: jobsAbi,
    functionName: "paymentToken",
  });
  return c.publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
}

export interface JobView {
  jobId: string;
  escrow: Address;
  client: Address;
  provider: Address;
  evaluator: Address;
  description: string;
  budget: string;
  expiresAt: string;
  /** Open, Funded, Submitted, Completed, Rejected or Expired. */
  status: string;
}

export async function getJob(c: Clients, escrow: Address, jobId: bigint): Promise<JobView> {
  const job = await c.publicClient.readContract({
    address: escrow,
    abi: jobsAbi,
    functionName: "getJob",
    args: [jobId],
  });
  if (job.id === 0n) throw new ArlJobError(`job ${jobId.toString()} does not exist`);
  const decimals = await decimalsOf(c, escrow);
  return {
    jobId: job.id.toString(),
    escrow,
    client: job.client,
    provider: job.provider,
    evaluator: job.evaluator,
    description: job.description,
    budget: formatUnits(job.budget, decimals),
    expiresAt: new Date(Number(job.expiredAt) * 1000).toISOString(),
    status: STATUS[job.status] ?? String(job.status),
  };
}

export interface CreateJobInput {
  provider: string;
  /** The account that approves the work; empty means the wallet itself. */
  evaluator?: string;
  hoursUntilDeadline: number;
  description: string;
}

export async function createJob(
  c: Clients,
  escrow: Address,
  input: CreateJobInput,
): Promise<{ jobId: string; txHash: Hash }> {
  await checkChain(c);
  const provider = checkAddress(input.provider, "the provider");
  const evaluator = input.evaluator?.trim()
    ? checkAddress(input.evaluator, "the evaluator")
    : sender(c);
  // The contract allows these, but they defeat the escrow (security report 2026-11-15).
  if (provider.toLowerCase() === evaluator.toLowerCase())
    throw new ArlJobError("the provider cannot evaluate its own work");
  if (provider.toLowerCase() === sender(c).toLowerCase())
    throw new ArlJobError("the client cannot hire itself");
  if (!(input.hoursUntilDeadline >= 1 && input.hoursUntilDeadline <= 24 * 365))
    throw new ArlJobError("the deadline must be between 1 hour and 365 days away");
  const { timestamp } = await c.publicClient.getBlock();
  const expiredAt = timestamp + BigInt(Math.round(input.hoursUntilDeadline * 3600));
  const { request } = await c.publicClient.simulateContract({
    address: escrow,
    abi: jobsAbi,
    functionName: "createJob",
    args: [
      provider,
      evaluator,
      expiredAt,
      input.description,
      "0x0000000000000000000000000000000000000000",
    ],
    account: sender(c),
  });
  const hash = await c.walletClient.writeContract(request as never);
  const receipt = await c.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new ArlJobError(`transaction ${hash} reverted`);
  const [created] = parseEventLogs({ abi: jobsAbi, eventName: "JobCreated", logs: receipt.logs });
  if (!created) throw new ArlJobError("the job was created but its id could not be read");
  return { jobId: created.args.jobId.toString(), txHash: hash };
}

export async function setBudget(
  c: Clients,
  escrow: Address,
  jobId: bigint,
  amount: string,
): Promise<{ txHash: Hash }> {
  await checkChain(c);
  const value = parseAmount(amount, await decimalsOf(c, escrow));
  return { txHash: await send(c, escrow, "setBudget", [jobId, value, "0x"]) };
}

/** Funds the agreed budget, approving the escrow first when its allowance is too low. */
export async function fundJob(
  c: Clients,
  escrow: Address,
  jobId: bigint,
): Promise<{ txHash: Hash; approveTxHash?: Hash; budget: string }> {
  await checkChain(c);
  const job = await c.publicClient.readContract({
    address: escrow,
    abi: jobsAbi,
    functionName: "getJob",
    args: [jobId],
  });
  if (job.budget === 0n) throw new ArlJobError("no budget is set: use Set Budget first");
  const token = await c.publicClient.readContract({
    address: escrow,
    abi: jobsAbi,
    functionName: "paymentToken",
  });
  const me = sender(c);
  const allowance = await c.publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [me, escrow],
  });
  let approveTxHash: Hash | undefined;
  if (allowance < job.budget) {
    const { request } = await c.publicClient.simulateContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [escrow, job.budget],
      account: me,
    });
    approveTxHash = await c.walletClient.writeContract(request as never);
    await c.publicClient.waitForTransactionReceipt({ hash: approveTxHash });
  }
  const txHash = await send(c, escrow, "fund", [jobId, job.budget, "0x"]);
  const decimals = await c.publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  });
  return {
    txHash,
    ...(approveTxHash ? { approveTxHash } : {}),
    budget: formatUnits(job.budget, decimals),
  };
}

export async function submitWork(
  c: Clients,
  escrow: Address,
  jobId: bigint,
  deliverable: string,
): Promise<{ txHash: Hash; deliverable: Hex }> {
  await checkChain(c);
  const value = toBytes32(deliverable);
  return { txHash: await send(c, escrow, "submit", [jobId, value, "0x"]), deliverable: value };
}

export async function settleJob(
  c: Clients,
  escrow: Address,
  jobId: bigint,
  outcome: "complete" | "reject" | "claimRefund",
  reason: string,
): Promise<{ txHash: Hash }> {
  await checkChain(c);
  if (outcome === "claimRefund") return { txHash: await send(c, escrow, "claimRefund", [jobId]) };
  return { txHash: await send(c, escrow, outcome, [jobId, toBytes32(reason || outcome), "0x"]) };
}

export interface OpenTaskInput {
  /** The arl-task/1 document, as JSON text or an object. */
  task: string | object;
  /** Where anyone can fetch the task document (https or ipfs). */
  taskUri: string;
  provider: string;
  /** Staked validators, comma or space separated, as many as the task's committee_size. */
  committee: string;
}

/**
 * Opens an arl-task/1 task as a verified job: the task is validated against its policy, then the
 * wallet creates the job, configures the committee, sets the budget, approves and funds it. These
 * are the same transactions the SDK, the MCP server and the Agent API prepare.
 */
export async function openArlTask(
  c: Clients,
  input: OpenTaskInput,
): Promise<{ jobId: string; taskHash: Hex; token: string; txs: Record<string, Hash> }> {
  let task: unknown = input.task;
  if (typeof task === "string") {
    try {
      task = JSON.parse(task);
    } catch {
      throw new ArlJobError("the task is not valid JSON");
    }
  }
  const token = (task as { payment?: { token?: unknown } } | null)?.payment?.token;
  if (token !== "ARL" && token !== "USDC")
    throw new ArlJobError('the task must be paid in "ARL" or "USDC"');
  const committee = input.committee
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((a, i) => checkAddress(a, `committee member ${String(i + 1)}`));
  const taskUri = input.taskUri.trim();
  if (!/^(https|ipfs):\/\/\S+$/.test(taskUri))
    throw new ArlJobError("the task URI must be an https:// or ipfs:// link");
  const provider = checkAddress(input.provider, "the provider");
  await checkChain(c);
  const opened = await openTask(c, task, {
    taskUri,
    provider,
    committee,
  });
  return {
    jobId: opened.jobId.toString(),
    taskHash: opened.taskHash,
    token,
    txs: opened.txs,
  };
}
