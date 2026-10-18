// Verified ERC-8183 jobs: open a job on ARLJobs whose evaluator is ARLVerifiedEvaluator, read its
// verdict and finalize it. A staked validator committee re-executes the job's spec and votes; after
// the challenge window anyone can finalize, which pays the provider (approved) or refunds the
// client (rejected). docs/verifiable-execution.md describes the protocol.
//
//   const jobId = await openVerifiedJob({ publicClient, walletClient }, {
//     provider, specUri, specHash, committee: [v1, v2, v3], threshold: 2 });
//
// Base Sepolia and the local chain only, like the contracts it calls.

import {
  parseAbi,
  parseEventLogs,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";

/** Base Sepolia deployment (contracts/deploy/base-sepolia.json). */
export const BASE_SEPOLIA_VERIFIED = {
  chainId: 84_532,
  jobs: "0xec79a897105aEd6daFBbB2a904E5bcFF71455644",
  evaluator: "0x6808F80Eb11538543d31cf4b50332B268dDd4d14",
  arbiterSafe: "0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f",
} as const satisfies Record<string, unknown>;

const ALLOWED = [84_532, 31_337];

export const verifiedJobsAbi = parseAbi([
  "function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256)",
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
]);

export const verifiedEvaluatorAbi = parseAbi([
  "struct Config { uint8 tier; uint8 threshold; uint64 voteWindow; uint64 challengeWindow; uint96 bond; uint256 providerAgentId; bytes32 specHash; address[] committee; }",
  "struct Verdict { uint8 phase; bool providerApproved; uint8 approvals; uint8 rejections; uint64 voteEnds; uint64 challengeEnds; address challenger; uint256 bond; bytes32 deliverable; bytes32 voteHash; }",
  "function configure(uint256 jobId, Config cfg)",
  "function getVerdict(uint256 jobId) view returns (Verdict)",
  "function finalize(uint256 jobId)",
]);

/** ARLVerifiedEvaluator.Phase, by index. */
export const VERDICT_PHASES = [
  "None",
  "Configured",
  "Approved",
  "Rejected",
  "Disputed",
  "Finalized",
  "Released",
  "Failed",
] as const;

export interface VerifiedClients {
  publicClient: PublicClient;
  walletClient: WalletClient<never, Chain, Account> | WalletClient;
}

export interface OpenVerifiedJobParams {
  provider: Address;
  /** Where validators fetch the arl-reexec/1 spec (https or ipfs); stored as the job description. */
  specUri: string;
  /** `specHash` of that spec (`arl-verifier hash`); validators refuse any other document. */
  specHash: Hex;
  /** Staked validators; 3 to 7 for re-execution. */
  committee: readonly Address[];
  /** Approvals needed: a strict majority of the committee, at least 2. */
  threshold: number;
  /** Seconds until the job expires; it must leave room for the vote and two challenge windows. */
  expiresIn?: bigint;
  voteWindow?: bigint;
  challengeWindow?: bigint;
  /** Bond floor in wei of the escrow token; the evaluator's minimum applies. */
  bond?: bigint;
  /** ERC-8004 agent id of the provider, or 0. */
  providerAgentId?: bigint;
  jobs?: Address;
  evaluator?: Address;
}

export class VerifiedJobError extends Error {
  override name = "VerifiedJobError";
}

async function checkChain(client: PublicClient): Promise<number> {
  const id = await client.getChainId();
  if (!ALLOWED.includes(id)) throw new VerifiedJobError(`chain ${id} is not supported`);
  return id;
}

function account(wallet: VerifiedClients["walletClient"]): Account {
  if (!wallet.account) throw new VerifiedJobError("the wallet client has no account");
  return wallet.account;
}

/** Checks the parameters the evaluator would reject, before any transaction is sent. */
export function checkOpenParams(p: OpenVerifiedJobParams): void {
  const n = p.committee.length;
  if (n < 3 || n > 7) throw new VerifiedJobError("committee must have 3 to 7 validators");
  if (new Set(p.committee.map((a) => a.toLowerCase())).size !== n)
    throw new VerifiedJobError("committee has duplicates");
  if (p.threshold < 2 || p.threshold > n || 2 * p.threshold <= n)
    throw new VerifiedJobError("threshold must be a strict majority of at least 2");
  if (!/^(https|ipfs):\/\//.test(p.specUri))
    throw new VerifiedJobError("specUri must be https or ipfs");
  if (!/^0x[0-9a-fA-F]{64}$/.test(p.specHash))
    throw new VerifiedJobError("specHash must be 32 bytes");
}

/**
 * Creates the job (the caller is its client) and configures the committee in two transactions.
 * The provider then approves the committee and sets the budget; the client funds the job.
 */
export async function openVerifiedJob(
  { publicClient, walletClient }: VerifiedClients,
  p: OpenVerifiedJobParams,
): Promise<{ jobId: bigint; createTx: Hash; configureTx: Hash }> {
  checkOpenParams(p);
  const chainId = await checkChain(publicClient);
  const local = chainId === 31_337;
  const jobs = p.jobs ?? (local ? undefined : BASE_SEPOLIA_VERIFIED.jobs);
  const evaluator = p.evaluator ?? (local ? undefined : BASE_SEPOLIA_VERIFIED.evaluator);
  if (!jobs || !evaluator) throw new VerifiedJobError("jobs and evaluator are required locally");
  const voteWindow = p.voteWindow ?? 3_600n;
  const challengeWindow = p.challengeWindow ?? 3_600n;
  const { timestamp } = await publicClient.getBlock();
  const expiredAt = timestamp + (p.expiresIn ?? 86_400n);
  const from = account(walletClient);

  const createTx = await walletClient.writeContract({
    account: from,
    chain: walletClient.chain,
    address: jobs,
    abi: verifiedJobsAbi,
    functionName: "createJob",
    args: [
      p.provider,
      evaluator,
      expiredAt,
      p.specUri,
      "0x0000000000000000000000000000000000000000",
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: createTx });
  if (receipt.status !== "success") throw new VerifiedJobError("createJob reverted");
  const created = parseEventLogs({
    abi: verifiedJobsAbi,
    eventName: "JobCreated",
    logs: receipt.logs,
  }).find((l) => l.address.toLowerCase() === jobs.toLowerCase());
  if (!created) throw new VerifiedJobError("JobCreated event missing");
  const jobId = created.args.jobId;

  const configureTx = await walletClient.writeContract({
    account: from,
    chain: walletClient.chain,
    address: evaluator,
    abi: verifiedEvaluatorAbi,
    functionName: "configure",
    args: [
      jobId,
      {
        tier: 1,
        threshold: p.threshold,
        voteWindow,
        challengeWindow,
        bond: p.bond ?? 10n ** 18n,
        providerAgentId: p.providerAgentId ?? 0n,
        specHash: p.specHash,
        committee: [...p.committee],
      },
    ],
  });
  const configured = await publicClient.waitForTransactionReceipt({ hash: configureTx });
  if (configured.status !== "success") throw new VerifiedJobError("configure reverted");
  return { jobId, createTx, configureTx };
}

/** The job's verdict, with the phase as text. */
export async function getVerdict(
  publicClient: PublicClient,
  jobId: bigint,
  evaluator: Address = BASE_SEPOLIA_VERIFIED.evaluator,
) {
  await checkChain(publicClient);
  const v = await publicClient.readContract({
    address: evaluator,
    abi: verifiedEvaluatorAbi,
    functionName: "getVerdict",
    args: [jobId],
  });
  return { ...v, phaseName: VERDICT_PHASES[v.phase] ?? `Phase ${String(v.phase)}` };
}

/** Pays out after the challenge window: anyone may call it. */
export async function finalizeJob(
  { publicClient, walletClient }: VerifiedClients,
  jobId: bigint,
  evaluator: Address = BASE_SEPOLIA_VERIFIED.evaluator,
): Promise<Hash> {
  await checkChain(publicClient);
  const hash = await walletClient.writeContract({
    account: account(walletClient),
    chain: walletClient.chain,
    address: evaluator,
    abi: verifiedEvaluatorAbi,
    functionName: "finalize",
    args: [jobId],
  });
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new VerifiedJobError("finalize reverted");
  return hash;
}
