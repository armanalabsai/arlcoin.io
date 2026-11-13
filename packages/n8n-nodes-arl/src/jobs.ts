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

/** The ARL escrows on Base Mainnet (contracts/deploy/base-mainnet-jobs.json). */
export const ESCROWS = {
  ARL: "0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9",
  USDC: "0xc833140D2eE8607fd41662cffFAc557f3D535bE6",
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
