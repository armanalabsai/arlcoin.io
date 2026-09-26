// Builds an ARL deployment plan from a public deployment config and the tokenomics source of
// truth. The plan is the only input the Foundry deployment script accepts.
//
// Every check here fails closed: `buildPlan` throws on the first problem and returns a plan only
// when every rule passes. The Foundry script re-validates the plan on-chain-side before
// deploying, so a hand-edited plan cannot bypass these rules.

import { ALLOCATIONS, MAX_SUPPLY, MIN_TIMELOCK_HOURS, validateAllocations } from "@arl/tokenomics";

export const PLAN_SCHEMA = "arl-deploy-plan/1";

/** Anvil's default chain ID. Only here may recipients be accounts without code. */
export const LOCAL_CHAIN_ID = 31337;

const DECIMALS = 18n;
const UNIT = 10n ** DECIMALS;
const UINT64_MAX = 2n ** 64n - 1n;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/;
const UTC_DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

/** Allocation ids in the order of the plan and the Solidity `Recipients` struct. */
export const RECIPIENT_KEYS = [
  "communityStaking",
  "liquidity",
  "strategicPartnerships",
  "publicLaunch",
  "grantsBugBounty",
  "team",
  "earlyUserRewards",
] as const;
type RecipientKey = (typeof RECIPIENT_KEYS)[number];

const ALLOCATION_KEY: Record<string, string> = {
  founder: "founder",
  "ecosystem-reserve": "ecosystemReserve",
  treasury: "treasury",
  "community-staking": "communityStaking",
  liquidity: "liquidity",
  "strategic-partnerships": "strategicPartnerships",
  "public-launch": "publicLaunch",
  "grants-bug-bounty": "grantsBugBounty",
  team: "team",
  "early-user-rewards": "earlyUserRewards",
};

export interface DeployConfig {
  network: string;
  chainId: number;
  /** UTC launch date, `YYYY-MM-DDTHH:MM:SSZ`, day of month at most 28. */
  launchDate: string;
  /** Must be true on every chain except local Anvil. */
  requireRecipientCode: boolean;
  founderBeneficiary: string;
  ecosystemReserveBeneficiary: string;
  treasury: { safe: string; minDelayHours: number };
  recipients: Record<RecipientKey, string>;
}

export interface DeployPlan {
  schema: typeof PLAN_SCHEMA;
  network: string;
  chainId: number;
  requireRecipientCode: boolean;
  maxSupply: string;
  allocations: Record<string, string>;
  founder: { beneficiary: string; cliffStart: number; cliffEnd: number; vestingEnd: number };
  ecosystemReserve: { beneficiary: string; start: number };
  treasury: { safe: string; minDelay: number };
  recipients: Record<RecipientKey, string>;
  source: { launchDate: string; founderCliff: string; founderVestingEnd: string };
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

export function buildPlan(config: DeployConfig): DeployPlan {
  const tokenomicsErrors = validateAllocations(ALLOCATIONS, MAX_SUPPLY);
  if (tokenomicsErrors.length > 0) fail(`tokenomics invalid: ${tokenomicsErrors.join("; ")}`);

  if (typeof config.network !== "string" || config.network.length === 0) {
    fail("network: missing");
  }
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0) {
    fail("chainId: missing or not a positive integer");
  }
  if (typeof config.requireRecipientCode !== "boolean") {
    fail("requireRecipientCode: must be true or false");
  }
  if (!config.requireRecipientCode && config.chainId !== LOCAL_CHAIN_ID) {
    fail(`requireRecipientCode: may be false only on local chain ${LOCAL_CHAIN_ID}`);
  }

  const founderBeneficiary = requireAddress(config.founderBeneficiary, "founderBeneficiary");
  const reserveBeneficiary = requireAddress(
    config.ecosystemReserveBeneficiary,
    "ecosystemReserveBeneficiary",
  );
  const treasurySafe = requireAddress(config.treasury.safe, "treasury.safe");

  const delayHours = config.treasury.minDelayHours;
  if (!Number.isSafeInteger(delayHours) || delayHours < MIN_TIMELOCK_HOURS) {
    fail(`treasury.minDelayHours: ${delayHours} is below the ${MIN_TIMELOCK_HOURS}-hour minimum`);
  }

  const recipients = {} as Record<RecipientKey, string>;
  for (const key of RECIPIENT_KEYS) {
    recipients[key] = requireAddress(config.recipients[key], `recipients.${key}`);
  }

  const founder = ALLOCATIONS.find((a) => a.id === "founder");
  if (founder?.release.kind !== "cliff-linear") fail("tokenomics: founder schedule not found");
  const launch = parseUtc(config.launchDate, "launchDate");
  const cliffEnd = addCalendarMonths(launch, founder.release.cliffMonths);
  const vestingEnd = addCalendarMonths(cliffEnd, founder.release.vestingMonths);

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
    founder: {
      beneficiary: founderBeneficiary,
      cliffStart: requireTimestamp(toUnix(launch), "founder.cliffStart"),
      cliffEnd: requireTimestamp(toUnix(cliffEnd), "founder.cliffEnd"),
      vestingEnd: requireTimestamp(toUnix(vestingEnd), "founder.vestingEnd"),
    },
    ecosystemReserve: {
      beneficiary: reserveBeneficiary,
      start: requireTimestamp(toUnix(launch), "ecosystemReserve.start"),
    },
    treasury: { safe: treasurySafe, minDelay: delayHours * 3600 },
    recipients,
    source: {
      launchDate: toIso(launch),
      founderCliff: toIso(cliffEnd),
      founderVestingEnd: toIso(vestingEnd),
    },
  };
}
