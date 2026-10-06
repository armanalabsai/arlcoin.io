// Builds the claim list for `ARLMerkleDistributor` (economic specification section 7: the
// approved Public Launch mechanism is a Merkle claim). Amounts, the budget, per-address limits
// and the claim window are inputs decided separately; nothing here chooses them.
//
// The tree is an OpenZeppelin StandardMerkleTree (`@openzeppelin/merkle-tree`, MIT) with leaves
// `(uint256 index, address account, uint256 amount)`, which is the encoding the contract checks.

import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { getAddress } from "viem";

import { ALLOCATIONS, PUBLIC_LAUNCH } from "@arl/tokenomics";

export const DISTRIBUTION_INPUT_SCHEMA = "arl-distribution-input/1";
export const DISTRIBUTION_SCHEMA = "arl-distribution/1";
export const LEAF_ENCODING = ["uint256", "address", "uint256"] as const;

/**
 * Allocations whose distribution mechanism is an approved Merkle claim. Early Users, Grants
 * and the other programs have no approved claim mechanism, so their lists are refused.
 */
export const CLAIM_ALLOCATIONS = { publicLaunch: "public-launch" } as const;
type ClaimAllocation = keyof typeof CLAIM_ALLOCATIONS;

const UNIT = 10n ** 18n;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/;
const BASE_UNITS = /^[1-9][0-9]*$/;

export interface DistributionInput {
  schema: typeof DISTRIBUTION_INPUT_SCHEMA;
  /** The allocation that funds the distribution. */
  allocation: string;
  /** Upper bound on the list total, in base units (18 decimals). */
  budget: string;
  /** Optional per-address limit, in base units. */
  maxPerAddress?: string;
  claims: { account: string; amount: string }[];
}

export interface DistributionClaim {
  index: number;
  amount: string;
  proof: string[];
}

export interface Distribution {
  schema: typeof DISTRIBUTION_SCHEMA;
  allocation: ClaimAllocation;
  merkleRoot: string;
  leafEncoding: typeof LEAF_ENCODING;
  /** Sum of every claim, in base units: the amount the distributor must be funded with. */
  total: string;
  count: number;
  /** Keyed by checksummed account. */
  claims: Record<string, DistributionClaim>;
}

export class DistributionError extends Error {
  override name = "DistributionError";
}

function fail(message: string): never {
  throw new DistributionError(message);
}

function baseUnits(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !BASE_UNITS.test(value)) {
    fail(`${field}: must be a positive integer string in base units`);
  }
  return BigInt(value);
}

function requireKeys(value: unknown, field: string, allowed: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${field}: must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${field}.${key}: unexpected key`);
  }
}

/** Validates a claim list and builds its Merkle tree. Fails closed on any problem. */
export function buildDistribution(input: DistributionInput): Distribution {
  requireKeys(input, "input", ["schema", "allocation", "budget", "maxPerAddress", "claims"]);
  const schema: unknown = input.schema;
  if (schema !== DISTRIBUTION_INPUT_SCHEMA) {
    fail(`schema: expected ${DISTRIBUTION_INPUT_SCHEMA}, got ${JSON.stringify(schema)}`);
  }

  const allocation = input.allocation;
  if (!Object.hasOwn(CLAIM_ALLOCATIONS, allocation)) {
    fail(`allocation: "${allocation}" has no approved Merkle claim mechanism`);
  }
  const allocationId = CLAIM_ALLOCATIONS[allocation as ClaimAllocation];
  const approved = ALLOCATIONS.find((a) => a.id === allocationId);
  if (!approved) fail(`tokenomics: allocation "${allocationId}" not found`);
  const ceiling = BigInt(approved.amount) * UNIT;

  const budget = baseUnits(input.budget, "budget");
  if (budget > ceiling) fail(`budget: ${budget} exceeds the ${allocation} allocation ${ceiling}`);
  const maxPerAddress =
    input.maxPerAddress === undefined ? undefined : baseUnits(input.maxPerAddress, "maxPerAddress");

  const claims: unknown = input.claims;
  if (!Array.isArray(claims) || claims.length === 0) fail("claims: must be a non-empty list");

  const seen = new Set<string>();
  const values: [string, string, string][] = [];
  let total = 0n;
  for (const [i, entry] of (claims as unknown[]).entries()) {
    const field = `claims[${String(i)}]`;
    requireKeys(entry, field, ["account", "amount"]);
    const { account, amount } = entry as { account: unknown; amount: unknown };
    if (typeof account !== "string" || !ADDRESS.test(account)) fail(`${field}.account: invalid`);
    if (ZERO_ADDRESS.test(account)) fail(`${field}.account: zero address`);
    const checksummed = getAddress(account);
    if (seen.has(checksummed)) fail(`${field}.account: ${checksummed} is listed twice`);
    seen.add(checksummed);
    const value = baseUnits(amount, `${field}.amount`);
    if (maxPerAddress !== undefined && value > maxPerAddress) {
      fail(`${field}.amount: ${value} exceeds maxPerAddress ${maxPerAddress}`);
    }
    total += value;
    values.push([String(i), checksummed, value.toString()]);
  }
  if (total > budget) fail(`claims total ${total} exceeds budget ${budget}`);

  const tree = StandardMerkleTree.of(values, [...LEAF_ENCODING]);
  const out: Record<string, DistributionClaim> = {};
  for (const [i, [index, account, amount]] of tree.entries()) {
    out[account] = { index: Number(index), amount, proof: tree.getProof(i) };
  }
  return {
    schema: DISTRIBUTION_SCHEMA,
    allocation: allocation as ClaimAllocation,
    merkleRoot: tree.root,
    leafEncoding: LEAF_ENCODING,
    total: total.toString(),
    count: values.length,
    claims: out,
  };
}

/** Recomputes the root from a distribution file's own claims and checks it matches. */
export function verifyDistribution(d: Distribution): void {
  const schema: unknown = d.schema;
  if (schema !== DISTRIBUTION_SCHEMA) fail(`schema: expected ${DISTRIBUTION_SCHEMA}`);
  const entries = Object.entries(d.claims);
  if (entries.length !== d.count) fail("count does not match the claims");
  const values = entries
    .map(([account, c]): [string, string, string] => [String(c.index), account, c.amount])
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  values.forEach(([index], i) => {
    if (index !== String(i)) fail(`claim indexes must be 0..${String(d.count - 1)}`);
  });
  const total = values.reduce((s, [, , amount]) => s + baseUnits(amount, "amount"), 0n);
  if (total.toString() !== d.total) fail("total does not match the claims");
  const tree = StandardMerkleTree.of(values, [...LEAF_ENCODING]);
  if (tree.root !== d.merkleRoot) fail("merkleRoot does not match the claims");
  for (const [account, c] of entries) {
    const leaf: [string, string, string] = [String(c.index), account, c.amount];
    if (!StandardMerkleTree.verify(d.merkleRoot, [...LEAF_ENCODING], leaf, c.proof)) {
      fail(`${account}: proof does not verify`);
    }
  }
}

const WHOLE_ARL = /^[1-9][0-9]*$/;

/**
 * Builds the Public Launch claim-list input from a whitelist CSV with the approved parameters
 * (`PUBLIC_LAUNCH` in `@arl/tokenomics`): budget = the TGE tranche, maxPerAddress = the
 * per-address cap. Each line is `address,amount` with the amount in whole ARL; a header line
 * starting with "address" and blank lines are skipped. The result still goes through
 * `buildDistribution`, which enforces the budget, the cap and every other rule.
 */
export function publicLaunchInput(csv: string): DistributionInput {
  const claims: DistributionInput["claims"] = [];
  for (const [i, raw] of csv.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (line === "" || (i === 0 && /^address\b/i.test(line))) continue;
    const [account, amount, ...rest] = line.split(",").map((c) => c.trim());
    if (!account || !amount || rest.length > 0) {
      fail(`line ${String(i + 1)}: expected "address,amount"`);
    }
    if (!WHOLE_ARL.test(amount))
      fail(`line ${String(i + 1)}: amount must be a whole number of ARL`);
    claims.push({ account, amount: (BigInt(amount) * UNIT).toString() });
  }
  return {
    schema: DISTRIBUTION_INPUT_SCHEMA,
    allocation: "publicLaunch",
    budget: (BigInt(PUBLIC_LAUNCH.tgeTranche) * UNIT).toString(),
    maxPerAddress: (BigInt(PUBLIC_LAUNCH.maxPerAddress) * UNIT).toString(),
    claims,
  };
}
