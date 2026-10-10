// The Public Launch claim (docs/launch-route.md, step 3): whitelist sign-ups claim their ARL from
// `ARLMerkleDistributor`. The claim list is published as a static file, `claims/<chainId>.json`,
// and the page trusts nothing in it that it can check on chain: the distributor's own root, token
// and deadline are read from the contract and must match the file, and every proof is verified
// here before a transaction is offered. A claim always pays the listed account; nothing here holds
// funds.
//
// Leaves use the OpenZeppelin StandardMerkleTree encoding the contract checks:
// keccak256(bytes.concat(keccak256(abi.encode(index, account, amount)))), with sorted pairs.

import {
  concat,
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

export const CLAIM_LIST_SCHEMA = "arl-claim-list/1";
export const DISTRIBUTION_SCHEMA = "arl-distribution/1";

export const distributorAbi = parseAbi([
  "function token() view returns (address)",
  "function merkleRoot() view returns (bytes32)",
  "function claimEnd() view returns (uint64)",
  "function isClaimed(uint256 index) view returns (bool)",
  "function claim(uint256 index, address account, uint256 amount, bytes32[] proof)",
]);

export interface Claim {
  index: bigint;
  amount: bigint;
  proof: Hex[];
}

export interface ClaimList {
  chainId: number;
  distributor: Address;
  token: Address;
  merkleRoot: Hex;
  total: bigint;
  count: number;
  /** Keyed by checksummed account. */
  claims: Map<Address, Claim>;
}

export class ClaimError extends Error {
  override name = "ClaimError";
}

function fail(message: string): never {
  throw new ClaimError(message);
}

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const BASE_UNITS = /^[1-9][0-9]*$/;

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${field}: must be an object`);
  }
  return value as Record<string, unknown>;
}

function address(value: unknown, field: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) fail(`${field}: invalid`);
  if (/^0x0{40}$/i.test(value)) fail(`${field}: zero address`);
  return getAddress(value);
}

function bytes32(value: unknown, field: string): Hex {
  if (typeof value !== "string" || !BYTES32.test(value)) fail(`${field}: not a 32-byte hex value`);
  return value.toLowerCase() as Hex;
}

function units(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !BASE_UNITS.test(value)) {
    fail(`${field}: must be a positive integer string in base units`);
  }
  return BigInt(value);
}

/** The leaf the contract hashes for one claim. */
export function leafHash(index: bigint, account: Address, amount: bigint): Hex {
  const inner = keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint256" }],
      [index, account, amount],
    ),
  );
  return keccak256(inner);
}

/** OpenZeppelin `MerkleProof.verify`: sorted-pair hashing from the leaf up to the root. */
export function verifyProof(root: Hex, leaf: Hex, proof: readonly Hex[]): boolean {
  let node = leaf.toLowerCase() as Hex;
  for (const sibling of proof) {
    const s = sibling.toLowerCase() as Hex;
    node = keccak256(BigInt(node) < BigInt(s) ? concat([node, s]) : concat([s, node]));
  }
  return node === root.toLowerCase();
}

/**
 * Reads a published claim list. Fails closed: wrong schema or chain, malformed entries, duplicate
 * indexes, a total that does not add up, or any proof that does not reach the root.
 */
export function parseClaimList(raw: unknown, expectedChainId: number): ClaimList {
  const file = object(raw, "claim list");
  if (file.schema !== CLAIM_LIST_SCHEMA) fail(`schema: expected ${CLAIM_LIST_SCHEMA}`);
  if (file.chainId !== expectedChainId) {
    fail(
      `chainId: the list is for ${String(file.chainId)}, the wallet is on ${String(expectedChainId)}`,
    );
  }
  const distributor = address(file.distributor, "distributor");
  const token = address(file.token, "token");
  const d = object(file.distribution, "distribution");
  if (d.schema !== DISTRIBUTION_SCHEMA)
    fail(`distribution.schema: expected ${DISTRIBUTION_SCHEMA}`);
  const merkleRoot = bytes32(d.merkleRoot, "distribution.merkleRoot");
  const total = units(d.total, "distribution.total");
  const count = d.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
    fail("distribution.count: must be a positive integer");
  }

  const claims = new Map<Address, Claim>();
  const indexes = new Set<bigint>();
  let sum = 0n;
  for (const [key, value] of Object.entries(object(d.claims, "distribution.claims"))) {
    const account = address(key, `claims.${key}`);
    if (claims.has(account)) fail(`claims.${key}: listed twice`);
    const c = object(value, `claims.${key}`);
    if (typeof c.index !== "number" || !Number.isInteger(c.index) || c.index < 0) {
      fail(`claims.${key}.index: must be a non-negative integer`);
    }
    const index = BigInt(c.index);
    if (indexes.has(index)) fail(`claims.${key}.index: ${String(c.index)} is used twice`);
    indexes.add(index);
    const amount = units(c.amount, `claims.${key}.amount`);
    if (!Array.isArray(c.proof)) fail(`claims.${key}.proof: must be a list`);
    const proof = (c.proof as unknown[]).map((p, i) =>
      bytes32(p, `claims.${key}.proof[${String(i)}]`),
    );
    if (!verifyProof(merkleRoot, leafHash(index, account, amount), proof)) {
      fail(`claims.${key}: proof does not reach the root`);
    }
    sum += amount;
    claims.set(account, { index, amount, proof });
  }
  if (claims.size !== count) fail("distribution.count does not match the claims");
  if (sum !== total) fail("distribution.total does not match the claims");
  return { chainId: expectedChainId, distributor, token, merkleRoot, total, count, claims };
}

/** What the distributor reports on chain. */
export interface OnChain {
  token: Address;
  merkleRoot: Hex;
  claimEnd: bigint;
}

/** Differences between the published list and the deployed distributor; empty when they agree. */
export function mismatches(list: ClaimList, chain: OnChain, expectedToken?: Address): string[] {
  const out: string[] = [];
  if (chain.merkleRoot.toLowerCase() !== list.merkleRoot) {
    out.push("the distributor's root is not the published list's root");
  }
  if (getAddress(chain.token) !== list.token) out.push("the distributor pays a different token");
  if (expectedToken && list.token !== getAddress(expectedToken)) {
    out.push("the list names a token that is not ARL on this network");
  }
  return out;
}

export type ClaimStatus =
  | { kind: "not-listed" }
  | { kind: "claimed"; claim: Claim }
  | { kind: "closed"; claim: Claim }
  | { kind: "open"; claim: Claim };

/** The connected account's position: not on the list, already claimed, window closed, or open. */
export function claimStatus(
  list: ClaimList,
  account: Address,
  claimed: boolean,
  claimEnd: bigint,
  nowSeconds: bigint,
): ClaimStatus {
  const claim = list.claims.get(getAddress(account));
  if (!claim) return { kind: "not-listed" };
  if (claimed) return { kind: "claimed", claim };
  if (nowSeconds >= claimEnd) return { kind: "closed", claim };
  return { kind: "open", claim };
}

/** Arguments of `claim` for an account on the list. */
export function claimArgs(account: Address, claim: Claim) {
  return [claim.index, getAddress(account), claim.amount, claim.proof] as const;
}
