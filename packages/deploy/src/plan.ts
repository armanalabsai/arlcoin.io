// Builds an ARL deployment plan from a public deployment config and the tokenomics source of
// truth. The plan is the only input the Foundry deployment script accepts.
//
// Every check here fails closed: `buildPlan` throws on the first problem and returns a plan only
// when every rule passes. The Foundry script re-validates the plan on-chain-side before
// deploying, so a hand-edited plan cannot bypass these rules.

import { ALLOCATIONS, MAX_SUPPLY, MIN_TIMELOCK_HOURS, validateAllocations } from "@arl/tokenomics";
import {
  getSafeL2SingletonDeployment,
  getSafeSingletonDeployment,
} from "@safe-global/safe-deployments";

/**
 * Plan schema. Version 3 removed the founder vesting wallet. Version 4 added the Safe v1.5.0
 * singletons every Safe role must point to. Version 5 mints the whole Founder allocation,
 * unlocked, to one Founder Safe (no tranches). Plans of older schemas, and configs that still
 * carry `vesting.founder`, are rejected, not reinterpreted.
 */
export const PLAN_SCHEMA = "arl-deploy-plan/5";

/** The Safe version every Safe role must run. */
export const SAFE_VERSION = "1.5.0";

/** Anvil's default chain ID. Only here may recipients lack code or schedules be unapproved. */
export const LOCAL_CHAIN_ID = 31337;

/** Base Sepolia: the only public network a plan may target. It may use a placeholder vesting start. */
export const TESTNET_CHAIN_ID = 84532;
/**
 * Base Mainnet: hard-locked. `networkGate` refuses it unconditionally; no config field, flag or
 * environment variable can open it. Mirrors `ARLDeployPlan.networkGate`.
 */
export const PRODUCTION_CHAIN_ID = 8453;

/** Local Anvil and Base Sepolia pass; Base Mainnet and every other chain are refused. */
export function networkGate(chainId: number): void {
  if (chainId === LOCAL_CHAIN_ID || chainId === TESTNET_CHAIN_ID) return;
  if (chainId === PRODUCTION_CHAIN_ID) {
    fail(`chainId: ${String(chainId)} (Base Mainnet) is locked; no plan may target it`);
  }
  fail(
    `chainId: ${String(chainId)} is not supported; only ${String(LOCAL_CHAIN_ID)} (local Anvil) and ${String(TESTNET_CHAIN_ID)} (Base Sepolia)`,
  );
}

const DECIMALS = 18n;
const UNIT = 10n ** DECIMALS;
const UINT64_MAX = 2n ** 64n - 1n;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/;
const UTC_DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

/** Holders minted to directly, in the order of the Solidity struct: eight dedicated Safes. */
export const RECIPIENT_KEYS = [
  "publicLaunch",
  "communityStaking",
  "ecosystemGrowth",
  "liquidity",
  "founder",
  "team",
  "earlyUsers",
  "grantsBugBounty",
] as const;
type RecipientKey = (typeof RECIPIENT_KEYS)[number];

/** Allocations held by a vesting wallet, with their tokenomics id. The Founder never vests. */
export const VESTING_KEYS = {
  investors: "investors",
  strategicPartnerships: "strategic-partnerships",
} as const;
type VestingKey = keyof typeof VESTING_KEYS;

/** Tokenomics id → plan key. Covers every allocation exactly once. */
const ALLOCATION_KEY: Record<string, string> = {
  "public-launch": "publicLaunch",
  "community-staking": "communityStaking",
  "ecosystem-growth": "ecosystemGrowth",
  "strategic-partnerships": "strategicPartnerships",
  liquidity: "liquidity",
  founder: "founder",
  investors: "investors",
  treasury: "treasury",
  team: "team",
  "early-users": "earlyUsers",
  "grants-bug-bounty": "grantsBugBounty",
};

const CONFIG_KEYS = [
  "network",
  "chainId",
  "requireRecipientCode",
  "note",
  "tge",
  "vesting",
  "treasury",
  "recipients",
  "safe",
];

/**
 * A vesting schedule supplied by configuration. The durations must equal the approved schedule
 * in `@arl/tokenomics` (12-month cliff, 36 months linear). There is no per-schedule start: every
 * schedule starts at the config's `tge` (approved rule VESTING_START = TGE_TIMESTAMP).
 */
export interface VestingConfig {
  beneficiary: string;
  cliffMonths: number;
  vestingMonths: number;
}

export interface DeployConfig {
  network: string;
  chainId: number;
  /** Must be true on every chain except local Anvil. */
  requireRecipientCode: boolean;
  /** Free text; ignored. */
  note?: string;
  /**
   * The TGE (token generation event), UTC `YYYY-MM-DDTHH:MM:SSZ` with day of month at most 28.
   * Every vesting schedule starts here (VESTING_START = TGE_TIMESTAMP).
   */
  tge: string;
  /**
   * Beneficiaries are dedicated Safes and must be deployed contracts off local Anvil. There is
   * no `founder` entry: the Founder allocation does not vest.
   */
  vesting: Record<VestingKey, VestingConfig>;
  /** `guardian` holds only the canceller role and must differ from `safe`. */
  treasury: { safe: string; guardian: string; minDelayHours: number };
  recipients: Record<RecipientKey, string>;
  /**
   * Local Anvil only: the Safe singletons a rehearsal deployed. Every other chain uses the
   * canonical Safe v1.5.0 singletons from `@safe-global/safe-deployments` and may not override
   * them.
   */
  safe?: { singletons: string[] };
}

export interface VestingPlan {
  beneficiary: string;
  cliffStart: number;
  cliffEnd: number;
  vestingEnd: number;
}

export interface DeployPlan {
  schema: typeof PLAN_SCHEMA;
  network: string;
  chainId: number;
  requireRecipientCode: boolean;
  maxSupply: string;
  allocations: Record<string, string>;
  vesting: Record<VestingKey, VestingPlan>;
  treasury: { safe: string; guardian: string; minDelay: number };
  recipients: Record<RecipientKey, string>;
  /** Safe v1.5.0 singletons the plan's Safes may point to. */
  safe: { singletons: string[] };
  source: Record<VestingKey, { start: string; cliffEnd: string; vestingEnd: string }>;
}

export class PlanError extends Error {
  override name = "PlanError";
}

function fail(message: string): never {
  throw new PlanError(message);
}

function requireAddress(value: unknown, field: string): string {
  if (typeof value !== "string" || !ADDRESS.test(value)) fail(`${field}: not an address`);
  if (ZERO_ADDRESS.test(value)) fail(`${field}: zero address`);
  return value;
}

function requireKeys(
  value: unknown,
  field: string,
  keys: readonly string[],
  optional: string[] = [],
) {
  if (typeof value !== "object" || value === null) fail(`${field}: missing`);
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(`${field}.${key}: unexpected key (legacy or unknown field)`);
  }
  for (const key of keys) {
    if (!optional.includes(key) && !(key in value)) fail(`${field}.${key}: missing`);
  }
}

interface UtcDate {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parseUtc(value: unknown, field: string): UtcDate {
  if (typeof value !== "string") fail(`${field}: expected a UTC date string`);
  const m = UTC_DATE.exec(value);
  if (!m) fail(`${field}: expected YYYY-MM-DDTHH:MM:SSZ, got "${value}"`);
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    fail(`${field}: "${value}" is not a real calendar date`);
  }
  // Days 29-31 do not exist in every month, so "N months later" would be ambiguous.
  if (day > 28) fail(`${field}: day of month must be 1-28 so month arithmetic is exact`);
  return { year, month, day, hour, minute, second };
}

/** Same day and time, `months` calendar months later. Never approximates a month in days. */
export function addCalendarMonths(date: UtcDate, months: number): UtcDate {
  const index = date.year * 12 + (date.month - 1) + months;
  return { ...date, year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function toUnix(date: UtcDate): number {
  return Date.UTC(date.year, date.month - 1, date.day, date.hour, date.minute, date.second) / 1000;
}

function toIso(date: UtcDate): string {
  return new Date(toUnix(date) * 1000).toISOString().replace(".000Z", "Z");
}

function requireTimestamp(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || BigInt(value) > UINT64_MAX) {
    fail(`${field}: timestamp out of range`);
  }
  return value;
}

function buildVesting(
  key: VestingKey,
  value: unknown,
  placeholderStartAllowed: boolean,
  tge: UtcDate,
): { plan: VestingPlan; source: { start: string; cliffEnd: string; vestingEnd: string } } {
  const field = `vesting.${key}`;
  if (typeof value === "object" && value !== null && "start" in value) {
    fail(`${field}.start: not allowed; every vesting schedule starts at tge (VESTING_START = TGE)`);
  }
  requireKeys(value, field, ["beneficiary", "cliffMonths", "vestingMonths"]);
  const v = value as VestingConfig;

  const allocation = ALLOCATIONS.find((a) => a.id === VESTING_KEYS[key]);
  if (allocation?.release.kind !== "vesting")
    fail(`tokenomics: ${VESTING_KEYS[key]} does not vest`);
  const approved = allocation.release.schedule;
  // The TGE date (and so the vesting start) is not confirmed. Only local Anvil and the testnet
  // may use a placeholder.
  if (
    (allocation.release.status !== "approved" || approved.start !== "approved") &&
    !placeholderStartAllowed
  ) {
    fail(
      `${field}: the TGE date, and so the vesting start, is not confirmed (TBD); only local Anvil and the testnet may use a placeholder`,
    );
  }

  const beneficiary = requireAddress(v.beneficiary, `${field}.beneficiary`);
  if (!Number.isInteger(v.cliffMonths) || v.cliffMonths < 0) {
    fail(`${field}.cliffMonths: must be a non-negative integer`);
  }
  if (!Number.isInteger(v.vestingMonths) || v.vestingMonths <= 0) {
    fail(`${field}.vestingMonths: must be a positive integer`);
  }
  if (v.cliffMonths !== approved.cliffMonths) {
    fail(`${field}.cliffMonths: must be ${String(approved.cliffMonths)} (approved schedule)`);
  }
  if (v.vestingMonths !== approved.linearMonths) {
    fail(`${field}.vestingMonths: must be ${String(approved.linearMonths)} (approved schedule)`);
  }
  const start = tge;
  const cliffEnd = addCalendarMonths(start, v.cliffMonths);
  const vestingEnd = addCalendarMonths(cliffEnd, v.vestingMonths);
  return {
    plan: {
      beneficiary,
      cliffStart: requireTimestamp(toUnix(start), "tge"),
      cliffEnd: requireTimestamp(toUnix(cliffEnd), `${field}.cliffEnd`),
      vestingEnd: requireTimestamp(toUnix(vestingEnd), `${field}.vestingEnd`),
    },
    source: { start: toIso(start), cliffEnd: toIso(cliffEnd), vestingEnd: toIso(vestingEnd) },
  };
}

/**
 * The canonical Safe v1.5.0 singletons (Safe and SafeL2) on `chainId`, from
 * `@safe-global/safe-deployments`. Fails if the chain has no canonical deployment.
 */
export function canonicalSafeSingletons(chainId: number): string[] {
  const singletons: string[] = [];
  for (const deployment of [
    getSafeSingletonDeployment({ version: SAFE_VERSION }),
    getSafeL2SingletonDeployment({ version: SAFE_VERSION }),
  ]) {
    if (!deployment) fail(`safe: no Safe ${SAFE_VERSION} deployment record`);
    const canonical = deployment.deployments.canonical?.address;
    const onChain: unknown = deployment.networkAddresses[String(chainId)];
    const addresses = Array.isArray(onChain) ? onChain : onChain === undefined ? [] : [onChain];
    if (canonical && addresses.includes(canonical)) singletons.push(canonical);
  }
  if (singletons.length === 0) {
    fail(`safe: no canonical Safe ${SAFE_VERSION} singleton on chain ${chainId}`);
  }
  return singletons;
}

export function buildPlan(config: DeployConfig): DeployPlan {
  const tokenomicsErrors = validateAllocations(ALLOCATIONS, MAX_SUPPLY);
  if (tokenomicsErrors.length > 0) fail(`tokenomics invalid: ${tokenomicsErrors.join("; ")}`);

  requireKeys(config, "config", CONFIG_KEYS, ["note", "safe"]);
  if (typeof config.network !== "string" || config.network.length === 0) {
    fail("network: missing");
  }
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0) {
    fail("chainId: missing or not a positive integer");
  }
  if (typeof config.requireRecipientCode !== "boolean") {
    fail("requireRecipientCode: must be true or false");
  }
  const local = config.chainId === LOCAL_CHAIN_ID;
  const testnet = config.chainId === TESTNET_CHAIN_ID;
  networkGate(config.chainId);
  if (!config.requireRecipientCode && !local) {
    fail(`requireRecipientCode: may be false only on local chain ${LOCAL_CHAIN_ID}`);
  }
  if (config.safe !== undefined && !local) {
    fail("safe: may be set only on local chain; other chains use the canonical Safe singletons");
  }

  // Configs are parsed from untyped JSON, so the section may be missing or malformed here.
  const vestingSection: unknown = config.vesting;
  if (
    typeof vestingSection === "object" &&
    vestingSection !== null &&
    "founder" in vestingSection
  ) {
    fail(
      `vesting.founder: the Founder allocation does not vest; ${PLAN_SCHEMA} has no founder vesting`,
    );
  }
  requireKeys(config.vesting, "vesting", Object.keys(VESTING_KEYS));
  const tge = parseUtc(config.tge, "tge");
  const vesting = {} as Record<VestingKey, VestingPlan>;
  const source = {} as DeployPlan["source"];
  for (const key of Object.keys(VESTING_KEYS) as VestingKey[]) {
    const built = buildVesting(key, config.vesting[key], local || testnet, tge);
    vesting[key] = built.plan;
    source[key] = built.source;
  }

  requireKeys(config.treasury, "treasury", ["safe", "guardian", "minDelayHours"]);
  const treasurySafe = requireAddress(config.treasury.safe, "treasury.safe");
  const treasuryGuardian = requireAddress(config.treasury.guardian, "treasury.guardian");
  if (treasuryGuardian.toLowerCase() === treasurySafe.toLowerCase()) {
    fail("treasury.guardian: must differ from treasury.safe");
  }
  const delayHours = config.treasury.minDelayHours;
  if (!Number.isSafeInteger(delayHours) || delayHours < MIN_TIMELOCK_HOURS) {
    fail(`treasury.minDelayHours: ${delayHours} is below the ${MIN_TIMELOCK_HOURS}-hour minimum`);
  }

  requireKeys(config.recipients, "recipients", RECIPIENT_KEYS);
  const recipients = {} as Record<RecipientKey, string>;
  for (const key of RECIPIENT_KEYS) {
    recipients[key] = requireAddress(config.recipients[key], `recipients.${key}`);
  }

  let safeSingletons: string[];
  if (local) {
    requireKeys(config.safe ?? { singletons: [] }, "safe", ["singletons"]);
    const listed: unknown = config.safe?.singletons ?? [];
    if (!Array.isArray(listed)) fail("safe.singletons: must be a list of addresses");
    safeSingletons = listed.map((a, i) => requireAddress(a, `safe.singletons[${String(i)}]`));
  } else {
    safeSingletons = canonicalSafeSingletons(config.chainId);
  }

  // Every address is dedicated to one role.
  const roles: [string, string][] = [
    ...(Object.keys(VESTING_KEYS) as VestingKey[]).map((k): [string, string] => [
      `vesting.${k}.beneficiary`,
      vesting[k].beneficiary,
    ]),
    ["treasury.safe", treasurySafe],
    ["treasury.guardian", treasuryGuardian],
    ...RECIPIENT_KEYS.map((k): [string, string] => [`recipients.${k}`, recipients[k]]),
  ];
  const seen = new Map<string, string>();
  for (const [field, address] of roles) {
    const other = seen.get(address.toLowerCase());
    if (other) fail(`${field}: same address as ${other}; every address must be dedicated`);
    seen.set(address.toLowerCase(), field);
  }

  const allocations: Record<string, string> = {};
  let total = 0n;
  for (const a of ALLOCATIONS) {
    const key = ALLOCATION_KEY[a.id];
    if (!key) fail(`tokenomics: allocation "${a.id}" has no deployment recipient`);
    const amount = BigInt(a.amount) * UNIT;
    allocations[key] = amount.toString();
    total += amount;
  }
  const maxSupply = BigInt(MAX_SUPPLY) * UNIT;
  if (total !== maxSupply) fail(`allocations total ${total}, expected ${maxSupply}`);

  return {
    schema: PLAN_SCHEMA,
    network: config.network,
    chainId: config.chainId,
    requireRecipientCode: config.requireRecipientCode,
    maxSupply: maxSupply.toString(),
    allocations,
    vesting,
    treasury: { safe: treasurySafe, guardian: treasuryGuardian, minDelay: delayHours * 3600 },
    recipients,
    safe: { singletons: safeSingletons },
    source,
  };
}
