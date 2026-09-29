// Job ratings on the ERC-8004 ReputationRegistry.
//
// After a paid job (ARLJobs, ERC-8183) the client can rate the provider's agent on the canonical
// ERC-8004 ReputationRegistry: `giveFeedback` with tag1 "starred" (a 0-100 score, as the standard
// suggests) and tag2 "arl-job". The feedback file names the job; it is stored on-chain as a
// base64 JSON data URI and its keccak256 is the feedback hash.
//
// Anyone can write feedback to the registry, so a raw average is easy to fake. The app counts a
// rating only if it points to a funded ARLJobs job whose client wrote it and whose provider is the
// rated service, and that job has ended (completed, rejected after funding, or expired). One
// rating per job counts: the latest, unless revoked. Everything read here is untrusted input.

import { getAddress, isAddress, isAddressEqual, keccak256 } from "viem";
import type { Address, Hex } from "viem";

import { IDENTITY_REGISTRY } from "./registry.ts";
import type { JobStatus } from "./jobs.ts";

/** Canonical ERC-8004 ReputationRegistry on the testnets (Base Sepolia among them); the local
 *  chain setup installs the same code at the same address. */
export const REPUTATION_REGISTRY: Address = "0x8004B663056A597Dffe9eCcC1965A193B7388713";

export const RATING_TAG = "starred";
export const JOB_TAG = "arl-job";
export const STARS = [1, 2, 3, 4, 5] as const;
const DATA_URI_PREFIX = "data:application/json;base64,";
const MAX_URI = 2048;

/** Stars (1 to 5) as the 0-100 "starred" value. */
export function starsToValue(stars: number): number {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new Error("rate 1 to 5 stars");
  return stars * 20;
}

export interface JobFeedback {
  chainId: number;
  agentId: bigint;
  client: Address;
  jobs: Address;
  jobId: bigint;
  value: number;
}

function toBase64(text: string): string {
  let binary = "";
  for (const b of new TextEncoder().encode(text)) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** The feedback file (ERC-8004 off-chain feedback structure plus an `arl` section) as a data URI,
 *  and its hash. */
export function encodeJobFeedback(f: JobFeedback, createdAt: Date): { uri: string; hash: Hex } {
  if (f.agentId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("agent id out of range");
  const file = {
    agentRegistry: `eip155:${String(f.chainId)}:${IDENTITY_REGISTRY}`,
    agentId: Number(f.agentId),
    clientAddress: `eip155:${String(f.chainId)}:${getAddress(f.client)}`,
    createdAt: createdAt.toISOString(),
    value: f.value,
    valueDecimals: 0,
    tag1: RATING_TAG,
    tag2: JOB_TAG,
    arl: {
      version: 1,
      jobs: `eip155:${String(f.chainId)}:${getAddress(f.jobs)}`,
      jobId: f.jobId.toString(),
    },
  };
  const json = JSON.stringify(file);
  return { uri: DATA_URI_PREFIX + toBase64(json), hash: keccak256(new TextEncoder().encode(json)) };
}

function caip10(value: unknown, chainId: number): Address {
  if (typeof value !== "string") throw new Error("not an account id");
  const [ns, chain, address] = value.split(":");
  if (ns !== "eip155" || chain !== String(chainId) || !address || !isAddress(address))
    throw new Error("account on another chain");
  return getAddress(address);
}

/** Reads a feedback file written by encodeJobFeedback; checks its hash and every field. */
export function decodeJobFeedback(
  uri: string,
  hash: Hex,
  chainId: number,
): { ok: true; value: JobFeedback } | { ok: false; error: string } {
  try {
    if (uri.length > MAX_URI || !uri.startsWith(DATA_URI_PREFIX))
      throw new Error("not an on-chain feedback file");
    const bytes = Uint8Array.from(atob(uri.slice(DATA_URI_PREFIX.length)), (c) => c.charCodeAt(0));
    if (keccak256(bytes) !== hash) throw new Error("the feedback hash does not match its file");
    const file = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Record<
      string,
      unknown
    >;
    if (file.agentRegistry !== `eip155:${String(chainId)}:${IDENTITY_REGISTRY}`)
      throw new Error("another identity registry");
    if (!Number.isSafeInteger(file.agentId) || (file.agentId as number) < 0)
      throw new Error("bad agent id");
    if (file.tag1 !== RATING_TAG || file.tag2 !== JOB_TAG || file.valueDecimals !== 0)
      throw new Error("not a job rating");
    const value = file.value;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100)
      throw new Error("rating out of range");
    const arl = file.arl as Record<string, unknown> | undefined;
    if (!arl || arl.version !== 1 || typeof arl.jobId !== "string" || !/^\d{1,20}$/.test(arl.jobId))
      throw new Error("no job reference");
    return {
      ok: true,
      value: {
        chainId,
        agentId: BigInt(file.agentId as number),
        client: caip10(file.clientAddress, chainId),
        jobs: caip10(arl.jobs, chainId),
        jobId: BigInt(arl.jobId),
        value,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unreadable feedback" };
  }
}

/** A NewFeedback event, as read from the registry. */
export interface FeedbackEvent {
  agentId: bigint;
  client: Address;
  index: bigint;
  value: bigint;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  uri: string;
  hash: Hex;
}

export interface JobView {
  client: Address;
  provider: Address;
  status: JobStatus;
  funded: boolean;
}

export interface Rating {
  jobId: bigint;
  client: Address;
  value: number;
}

/**
 * The ratings of one service that count: see the file comment. `events` must be in log order;
 * `revoked` holds "client:index" keys of revoked feedback.
 */
export function verifiedRatings(args: {
  chainId: number;
  agentId: bigint;
  payTo: Address;
  jobsAddress: Address;
  events: readonly FeedbackEvent[];
  revoked: ReadonlySet<string>;
  jobs: ReadonlyMap<bigint, JobView>;
}): Rating[] {
  const byJob = new Map<bigint, Rating>();
  for (const e of args.events) {
    if (e.agentId !== args.agentId || e.tag1 !== RATING_TAG || e.tag2 !== JOB_TAG) continue;
    if (e.valueDecimals !== 0 || e.value < 0n || e.value > 100n) continue;
    const parsed = decodeJobFeedback(e.uri, e.hash, args.chainId);
    if (!parsed.ok) continue;
    const f = parsed.value;
    if (f.agentId !== e.agentId || BigInt(f.value) !== e.value) continue;
    if (!isAddressEqual(f.client, e.client) || !isAddressEqual(f.jobs, args.jobsAddress)) continue;
    const job = args.jobs.get(f.jobId);
    if (!job || !job.funded) continue;
    if (!isAddressEqual(job.client, e.client) || !isAddressEqual(job.provider, args.payTo))
      continue;
    if (job.status !== "Completed" && job.status !== "Rejected" && job.status !== "Expired")
      continue;
    const key = `${getAddress(e.client)}:${e.index.toString()}`;
    // Revoking the latest rating of a job leaves the job unrated.
    if (args.revoked.has(key)) byJob.delete(f.jobId);
    else byJob.set(f.jobId, { jobId: f.jobId, client: getAddress(e.client), value: f.value });
  }
  return [...byJob.values()];
}

export function summarise(ratings: readonly Rating[]): { count: number; average?: number } {
  if (ratings.length === 0) return { count: 0 };
  const total = ratings.reduce((sum, r) => sum + r.value, 0);
  return { count: ratings.length, average: Math.round(total / ratings.length) };
}

/** The subset of the ERC-8004 ReputationRegistry the app uses. */
export const reputationRegistryAbi = [
  {
    type: "function",
    name: "giveFeedback",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "revokeFeedback",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "feedbackIndex", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "NewFeedback",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "clientAddress", type: "address", indexed: true },
      { name: "feedbackIndex", type: "uint64", indexed: false },
      { name: "value", type: "int128", indexed: false },
      { name: "valueDecimals", type: "uint8", indexed: false },
      { name: "indexedTag1", type: "string", indexed: true },
      { name: "tag1", type: "string", indexed: false },
      { name: "tag2", type: "string", indexed: false },
      { name: "endpoint", type: "string", indexed: false },
      { name: "feedbackURI", type: "string", indexed: false },
      { name: "feedbackHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "FeedbackRevoked",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "clientAddress", type: "address", indexed: true },
      { name: "feedbackIndex", type: "uint64", indexed: true },
    ],
  },
] as const;
