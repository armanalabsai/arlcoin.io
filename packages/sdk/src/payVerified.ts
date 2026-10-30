// Pay for an HTTP service through a verified job (spec/x402-arl-escrow, v0.2.0 draft).
//
//   const { response, jobId } = await payVerified(clients, "https://service.example/run", {
//     maxBudget: parseUnits("100", 18) });
//
// The service answers `402 Payment Required` with `accepts[]` holding an `arl-escrow` offer. The
// client opens the job on ARLJobs with ARLVerifiedEvaluator as evaluator, sets the budget, funds
// it in ARL, and repeats the request with the `X-ARL-Job` header. The payment stays in escrow
// until the committee's verdict is final; the provider is paid only on approval.

import { getAddress, isAddress, parseAbi, type Address, type Hash, type Hex } from "viem";

import {
  VerifiedJobError,
  checkEvaluationFits,
  checkVerifiedChain,
  openVerifiedJob,
  verifiedDeployment,
  walletAccount,
  type VerifiedClients,
} from "./verified.ts";

export const ESCROW_SCHEME = "arl-escrow";
/** Header of the repeated request: `<chainId>:<jobs>:<jobId>`. */
export const JOB_HEADER = "X-ARL-Job";

/** The `arl-escrow` offer in a 402 response (`accepts[]` entry). */
export interface EscrowOffer {
  scheme: typeof ESCROW_SCHEME;
  network: `eip155:${number}`;
  jobs: Address;
  evaluator: Address;
  provider: Address;
  specUri: string;
  specHash: Hex;
  /** Budget in ARL base units. */
  budget: bigint;
  committee: Address[];
  threshold: number;
  voteWindow: bigint;
  challengeWindow: bigint;
  bond: bigint;
  /** Seconds the job may stay open. */
  expiresIn: bigint;
}

const tokenAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);
const escrowAbi = parseAbi([
  "function paymentToken() view returns (address)",
  "function setBudget(uint256 jobId, uint256 amount, bytes optParams)",
  "function fund(uint256 jobId, uint256 expectedBudget, bytes optParams)",
]);

const uint = (v: unknown, what: string): bigint => {
  if (typeof v !== "string" || !/^\d{1,78}$/.test(v))
    throw new VerifiedJobError(`${what} is not a uint`);
  return BigInt(v);
};
const addr = (v: unknown, what: string): Address => {
  if (typeof v !== "string" || !isAddress(v))
    throw new VerifiedJobError(`${what} is not an address`);
  return getAddress(v);
};

/** Reads the `arl-escrow` offer from a 402 body; throws when there is none or it is malformed. */
export function parseEscrowOffer(body: unknown): EscrowOffer {
  const accepts = (body as { accepts?: unknown } | null)?.accepts;
  if (!Array.isArray(accepts)) throw new VerifiedJobError("402 body has no accepts list");
  const o = accepts.find((a) => (a as { scheme?: unknown } | null)?.scheme === ESCROW_SCHEME) as
    Record<string, unknown> | undefined;
  if (!o) throw new VerifiedJobError("the service offers no arl-escrow payment");
  const network = o.network;
  if (typeof network !== "string" || !/^eip155:\d+$/.test(network))
    throw new VerifiedJobError("network is not a CAIP-2 eip155 id");
  const e = (o.extra ?? {}) as Record<string, unknown>;
  const committee = e.committee;
  if (!Array.isArray(committee)) throw new VerifiedJobError("committee is not a list");
  const threshold = e.threshold;
  if (typeof threshold !== "number" || !Number.isInteger(threshold))
    throw new VerifiedJobError("threshold is not an integer");
  const specUri = e.specUri;
  if (typeof specUri !== "string") throw new VerifiedJobError("specUri is missing");
  const specHash = e.specHash;
  if (typeof specHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(specHash))
    throw new VerifiedJobError("specHash is not 32 bytes");
  return {
    scheme: ESCROW_SCHEME,
    network: network as `eip155:${number}`,
    jobs: addr(e.jobs, "jobs"),
    evaluator: addr(e.evaluator, "evaluator"),
    provider: addr(o.payTo, "payTo"),
    specUri,
    specHash: specHash as Hex,
    budget: uint(o.amount, "amount"),
    committee: committee.map((c, i) => addr(c, `committee[${String(i)}]`)),
    threshold,
    voteWindow: uint(e.voteWindow, "voteWindow"),
    challengeWindow: uint(e.challengeWindow, "challengeWindow"),
    bond: uint(e.bond, "bond"),
    expiresIn: uint(e.expiresIn, "expiresIn"),
  };
}

/** Sets the budget, approves ARLJobs for it and funds the job, as its client. */
export async function fundVerifiedJob(
  { publicClient, walletClient }: VerifiedClients,
  jobs: Address,
  jobId: bigint,
  budget: bigint,
): Promise<{ fundTx: Hash }> {
  const from = walletAccount(walletClient);
  const token = await publicClient.readContract({
    address: jobs,
    abi: escrowAbi,
    functionName: "paymentToken",
  });
  const balance = await publicClient.readContract({
    address: token,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [from.address],
  });
  if (balance < budget) throw new VerifiedJobError("the client holds less ARL than the budget");
  await checkEvaluationFits(publicClient, jobs, jobId);
  const send = async (
    address: Address,
    abi: typeof escrowAbi | typeof tokenAbi,
    functionName: string,
    args: readonly unknown[],
  ) => {
    const hash = await walletClient.writeContract({
      account: from,
      chain: walletClient.chain,
      address,
      abi,
      functionName,
      args,
    } as never);
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new VerifiedJobError(`${functionName} reverted`);
    return hash;
  };
  await send(jobs, escrowAbi, "setBudget", [jobId, budget, "0x"]);
  await send(token, tokenAbi, "approve", [jobs, budget]);
  const fundTx = await send(jobs, escrowAbi, "fund", [jobId, budget, "0x"]);
  return { fundTx };
}

export interface PayVerifiedOptions {
  /** Largest budget the client accepts, in ARL base units. */
  maxBudget: bigint;
  /** Request options for both the first and the repeated request. */
  init?: RequestInit;
  fetch?: typeof globalThis.fetch;
}

/**
 * Requests `url`; on a 402 with an `arl-escrow` offer, opens and funds a verified job within
 * `maxBudget` and repeats the request with the job id. Any other response is returned as is.
 */
export async function payVerified(
  clients: VerifiedClients,
  url: string,
  options: PayVerifiedOptions,
): Promise<{ response: Response; jobId?: bigint }> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const first = await fetchFn(url, options.init);
  if (first.status !== 402) return { response: first };
  const offer = parseEscrowOffer(await first.json());

  const chainId = await checkVerifiedChain(clients.publicClient);
  if (offer.network !== `eip155:${String(chainId)}`)
    throw new VerifiedJobError(
      `the offer is for ${offer.network}, the client is on chain ${String(chainId)}`,
    );
  const known = verifiedDeployment(chainId);
  if (known && (known.jobs !== offer.jobs || known.evaluator !== offer.evaluator))
    throw new VerifiedJobError("the offer names another escrow or evaluator than ARL's deployment");
  if (offer.budget <= 0n || offer.budget > options.maxBudget)
    throw new VerifiedJobError("the offer's budget is zero or above maxBudget");

  const { jobId } = await openVerifiedJob(clients, {
    provider: offer.provider,
    specUri: offer.specUri,
    specHash: offer.specHash,
    committee: offer.committee,
    threshold: offer.threshold,
    expiresIn: offer.expiresIn,
    voteWindow: offer.voteWindow,
    challengeWindow: offer.challengeWindow,
    bond: offer.bond,
    jobs: offer.jobs,
    evaluator: offer.evaluator,
  });
  await fundVerifiedJob(clients, offer.jobs, jobId, offer.budget);

  const headers = new Headers(options.init?.headers);
  headers.set(JOB_HEADER, `${String(chainId)}:${offer.jobs}:${jobId.toString()}`);
  const response = await fetchFn(url, { ...options.init, headers });
  return { response, jobId };
}
