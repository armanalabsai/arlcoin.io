// The on-chain side of a validator: read a job and its committed spec hash, find the submitted
// deliverable, accept, vote. Base Mainnet (where the evaluator is deployed, see
// docs/mainnet-services.md), Base Sepolia and the local chain; any other chain is refused.

import {
  parseAbi,
  parseAbiItem,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";

export const ALLOWED_CHAINS = [8_453, 84_532, 31_337] as const;

export class ChainError extends Error {
  override name = "ChainError";
}

export function checkChain(chainId: number): void {
  if (!(ALLOWED_CHAINS as readonly number[]).includes(chainId)) {
    throw new ChainError(
      `chain ${chainId} is not allowed (Base Mainnet, Base Sepolia and local only)`,
    );
  }
}

export const jobsAbi = parseAbi([
  "struct Job { uint256 id; address client; address provider; address evaluator; string description; uint256 budget; uint256 expiredAt; uint8 status; address hook; }",
  "function getJob(uint256 jobId) view returns (Job)",
  "event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)",
]);

export const evaluatorAbi = parseAbi([
  "struct Config { uint8 tier; uint8 threshold; uint64 voteWindow; uint64 challengeWindow; uint96 bond; uint256 providerAgentId; bytes32 specHash; address[] committee; }",
  "struct Verdict { uint8 phase; bool providerApproved; uint8 approvals; uint8 rejections; uint64 voteEnds; uint64 challengeEnds; address challenger; uint256 bond; bytes32 deliverable; bytes32 voteHash; }",
  "function jobs() view returns (address)",
  "function getConfig(uint256 jobId) view returns (Config)",
  "function getVerdict(uint256 jobId) view returns (Verdict)",
  "function voteOf(uint256 jobId, address validator) view returns (uint8)",
  "function accept(uint256 jobId)",
  "function vote(uint256 jobId, bool approve, bytes32 deliverable, bytes32 evidence)",
]);

/** ARLJobs.JobStatus. */
export const JobStatus = {
  Open: 0,
  Funded: 1,
  Submitted: 2,
  Completed: 3,
  Rejected: 4,
  Expired: 5,
} as const;
/** ARLVerifiedEvaluator member states (`voteOf`). */
export const MemberState = {
  None: 0,
  Member: 1,
  Accepted: 2,
  Approved: 3,
  Rejected: 4,
  Absent: 5,
} as const;

export interface JobView {
  jobs: Address;
  status: number;
  /** The job description: by convention the spec's URI (https or ipfs). */
  description: string;
  specHash: Hex;
  phase: number;
  memberState: number;
  /** The deliverable from `JobSubmitted`, if the job was submitted. */
  deliverable: Hex | null;
}

export async function readJob(
  client: PublicClient,
  evaluator: Address,
  jobId: bigint,
  validator: Address,
): Promise<JobView> {
  checkChain(await client.getChainId());
  const jobs = await client.readContract({
    address: evaluator,
    abi: evaluatorAbi,
    functionName: "jobs",
  });
  const [job, config, verdict, memberState] = await Promise.all([
    client.readContract({ address: jobs, abi: jobsAbi, functionName: "getJob", args: [jobId] }),
    client.readContract({
      address: evaluator,
      abi: evaluatorAbi,
      functionName: "getConfig",
      args: [jobId],
    }),
    client.readContract({
      address: evaluator,
      abi: evaluatorAbi,
      functionName: "getVerdict",
      args: [jobId],
    }),
    client.readContract({
      address: evaluator,
      abi: evaluatorAbi,
      functionName: "voteOf",
      args: [jobId, validator],
    }),
  ]);
  let deliverable: Hex | null = null;
  if (job.status >= JobStatus.Submitted) {
    const logs = await client.getLogs({
      address: jobs,
      event: parseAbiItem(
        "event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)",
      ),
      args: { jobId },
      fromBlock: 0n,
    });
    deliverable = logs.at(-1)?.args.deliverable ?? null;
  }
  return {
    jobs,
    status: job.status,
    description: job.description,
    specHash: config.specHash,
    phase: verdict.phase,
    memberState,
    deliverable,
  };
}

type Wallet = WalletClient<Transport, Chain, Account>;

export async function acceptJob(
  wallet: Wallet,
  client: PublicClient,
  evaluator: Address,
  jobId: bigint,
): Promise<Hex> {
  checkChain(await client.getChainId());
  const hash = await wallet.writeContract({
    address: evaluator,
    abi: evaluatorAbi,
    functionName: "accept",
    args: [jobId],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
  return hash;
}

export async function castVote(
  wallet: Wallet,
  client: PublicClient,
  evaluator: Address,
  jobId: bigint,
  approve: boolean,
  deliverable: Hex,
  evidence: Hex,
): Promise<Hex> {
  checkChain(await client.getChainId());
  const hash = await wallet.writeContract({
    address: evaluator,
    abi: evaluatorAbi,
    functionName: "vote",
    args: [jobId, approve, deliverable, evidence],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
  return hash;
}
