// The service side of an arl-escrow payment (spec/x402-arl-escrow, v0.2.0 draft): build the 402
// offer, check the job a client funded before doing the work, approve the committee and submit
// the deliverable.
//
//   res.status(402).json(buildEscrowOffer({ chainId, provider, specUri, specHash, budget, … }));
//   const job = await checkFundedJob(publicClient, offer, req.headers["x-arl-job"]);
//   await approveCommittee(clients, offer, job.jobId);   // validators can now accept
//   … run the spec …
//   await submitDeliverable(clients, offer, job.jobId, deliverableHash);

import { getAddress, parseAbi, type Address, type Hash, type Hex } from "viem";

import { ESCROW_SCHEME, type EscrowOffer } from "./payVerified.ts";
import {
  VerifiedJobError,
  checkVerifiedChain,
  verifiedDeployment,
  walletAccount,
  type VerifiedClients,
} from "./verified.ts";

export interface EscrowOfferInput {
  chainId: number;
  /** The service's address: the job's provider, paid on approval. */
  provider: Address;
  specUri: string;
  specHash: Hex;
  /** Price in ARL base units. */
  budget: bigint;
  committee: readonly Address[];
  threshold: number;
  voteWindow?: bigint;
  challengeWindow?: bigint;
  bond?: bigint;
  expiresIn?: bigint;
  /** Required on the local chain; defaults to ARL's deployment elsewhere. */
  jobs?: Address;
  evaluator?: Address;
}

/** The 402 body offering payment through a verified job. */
export function buildEscrowOffer(input: EscrowOfferInput) {
  const known = verifiedDeployment(input.chainId);
  const jobs = input.jobs ?? known?.jobs;
  const evaluator = input.evaluator ?? known?.evaluator;
  if (!jobs || !evaluator) throw new VerifiedJobError("jobs and evaluator are required locally");
  if (input.budget <= 0n) throw new VerifiedJobError("budget must be positive");
  return {
    x402Version: 2,
    accepts: [
      {
        scheme: ESCROW_SCHEME,
        network: `eip155:${String(input.chainId)}`,
        amount: input.budget.toString(),
        payTo: getAddress(input.provider),
        extra: {
          jobs: getAddress(jobs),
          evaluator: getAddress(evaluator),
          specUri: input.specUri,
          specHash: input.specHash,
          committee: input.committee.map((c) => getAddress(c)),
          threshold: input.threshold,
          voteWindow: (input.voteWindow ?? 3_600n).toString(),
          challengeWindow: (input.challengeWindow ?? 86_400n).toString(),
          bond: (input.bond ?? 100n * 10n ** 18n).toString(),
          expiresIn: (input.expiresIn ?? 259_200n).toString(),
        },
      },
    ],
  };
}

const jobsAbi = parseAbi([
  "struct Job { uint256 id; address client; address provider; address evaluator; string description; uint256 budget; uint256 expiredAt; uint8 status; address hook; }",
  "function getJob(uint256 jobId) view returns (Job)",
  "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
]);
const evaluatorAbi = parseAbi([
  "struct Config { uint8 tier; uint8 threshold; uint64 voteWindow; uint64 challengeWindow; uint96 bond; uint256 providerAgentId; bytes32 specHash; address[] committee; }",
  "function getConfig(uint256 jobId) view returns (Config)",
  "function approveCommittee(uint256 jobId)",
]);

/** ARLJobs.JobStatus.Funded. */
const FUNDED = 1;

/**
 * Checks the job named by the `X-ARL-Job` header against the offer before any work: same chain
 * and escrow, the service as provider, the offer's evaluator, budget, spec, committee and
 * threshold, and the job funded. Returns the job id and the client.
 */
export async function checkFundedJob(
  publicClient: VerifiedClients["publicClient"],
  offer: EscrowOffer,
  header: string | null | undefined,
): Promise<{ jobId: bigint; client: Address }> {
  const m = /^(\d+):(0x[0-9a-fA-F]{40}):(\d+)$/.exec(header ?? "");
  if (!m) throw new VerifiedJobError("missing or malformed X-ARL-Job header");
  const chainId = await checkVerifiedChain(publicClient);
  if (Number(m[1]) !== chainId || `eip155:${String(chainId)}` !== offer.network)
    throw new VerifiedJobError("the job is on another chain");
  if (getAddress(m[2] ?? "") !== offer.jobs)
    throw new VerifiedJobError("the job is in another escrow");
  const jobId = BigInt(m[3] ?? "0");
  const job = await publicClient.readContract({
    address: offer.jobs,
    abi: jobsAbi,
    functionName: "getJob",
    args: [jobId],
  });
  const cfg = await publicClient.readContract({
    address: offer.evaluator,
    abi: evaluatorAbi,
    functionName: "getConfig",
    args: [jobId],
  });
  const problems: string[] = [];
  if (job.status !== FUNDED) problems.push("not funded");
  if (getAddress(job.provider) !== offer.provider) problems.push("another provider");
  if (getAddress(job.evaluator) !== offer.evaluator) problems.push("another evaluator");
  if (job.budget !== offer.budget) problems.push("another budget");
  if (cfg.specHash.toLowerCase() !== offer.specHash.toLowerCase()) problems.push("another spec");
  if (cfg.threshold !== offer.threshold) problems.push("another threshold");
  const committee = cfg.committee.map((c) => getAddress(c)).join();
  if (committee !== offer.committee.join()) problems.push("another committee");
  if (problems.length > 0)
    throw new VerifiedJobError(`job ${jobId.toString()}: ${problems.join(", ")}`);
  return { jobId, client: getAddress(job.client) };
}

async function send(
  { publicClient, walletClient }: VerifiedClients,
  address: Address,
  abi: typeof jobsAbi | typeof evaluatorAbi,
  functionName: "approveCommittee" | "submit",
  args: readonly unknown[],
): Promise<Hash> {
  const hash = await walletClient.writeContract({
    account: walletAccount(walletClient),
    chain: walletClient.chain,
    address,
    abi,
    functionName,
    args,
  } as never);
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new VerifiedJobError(`${functionName} reverted`);
  return hash;
}

/** As the provider: approves the committee, so the validators can accept the job. */
export function approveCommittee(
  clients: VerifiedClients,
  offer: EscrowOffer,
  jobId: bigint,
): Promise<Hash> {
  return send(clients, offer.evaluator, evaluatorAbi, "approveCommittee", [jobId]);
}

/** As the provider: submits the deliverable hash (the result manifest's deliverable). */
export function submitDeliverable(
  clients: VerifiedClients,
  offer: EscrowOffer,
  jobId: bigint,
  deliverable: Hex,
): Promise<Hash> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(deliverable))
    throw new VerifiedJobError("deliverable must be 32 bytes");
  return send(clients, offer.jobs, jobsAbi, "submit", [jobId, deliverable, "0x"]);
}
