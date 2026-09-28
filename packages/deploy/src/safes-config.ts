// Builds a deployment config from the Safes written by `CreateSafes.s.sol`.
//
// Every value except the Safe addresses is fixed here: code checks on, the approved 12 + 36 month
// vesting durations, and the 48-hour timelock floor. The vesting start is a placeholder, which
// the network gate accepts only on local Anvil and Base Sepolia.

import {
  LOCAL_CHAIN_ID,
  TESTNET_CHAIN_ID,
  PlanError,
  networkGate,
  type DeployConfig,
} from "./plan.ts";

const ROLES = [
  "founder",
  "investors",
  "strategicPartnerships",
  "treasury",
  "guardian",
  "publicLaunch",
  "communityStaking",
  "ecosystemGrowth",
  "liquidity",
  "team",
  "earlyUsers",
  "grantsBugBounty",
] as const;
type Role = (typeof ROLES)[number];

export interface SafesRecord {
  chainId: number;
  singleton: string;
  safes: Record<Role, string>;
}

const UTC_DAY = /^\d{4}-\d{2}-(0[1-9]|1\d|2[0-8])T00:00:00Z$/;

function fail(message: string): never {
  throw new PlanError(message);
}

/**
 * @param vestingStart Placeholder vesting start, `YYYY-MM-DDT00:00:00Z` with day 1-28. The real
 *   start is not confirmed; this value is accepted only on local Anvil and Base Sepolia.
 */
export function configFromSafes(record: SafesRecord, vestingStart: string): DeployConfig {
  networkGate(record.chainId);
  if (!UTC_DAY.test(vestingStart)) {
    fail("vestingStart: must be YYYY-MM-DDT00:00:00Z with a day of month from 1 to 28");
  }
  // The record is read from JSON, so its safes section is untrusted.
  const safes: unknown = record.safes;
  if (typeof safes !== "object" || safes === null) fail("safes: missing");
  const keys = Object.keys(safes).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...ROLES].sort())) {
    fail(`safes: expected exactly ${ROLES.join(", ")}`);
  }
  const s = record.safes;
  const local = record.chainId === LOCAL_CHAIN_ID;
  const vesting = (beneficiary: string) => ({
    beneficiary,
    start: vestingStart,
    cliffMonths: 12,
    vestingMonths: 36,
  });
  const config: DeployConfig = {
    network: record.chainId === TESTNET_CHAIN_ID ? "base-sepolia" : "local",
    chainId: record.chainId,
    requireRecipientCode: true,
    note: `Safes created by CreateSafes.s.sol. The vesting start ${vestingStart} is a placeholder: the real start is not confirmed.`,
    vesting: {
      investors: vesting(s.investors),
      strategicPartnerships: vesting(s.strategicPartnerships),
    },
    treasury: { safe: s.treasury, guardian: s.guardian, minDelayHours: 48 },
    recipients: {
      publicLaunch: s.publicLaunch,
      communityStaking: s.communityStaking,
      ecosystemGrowth: s.ecosystemGrowth,
      liquidity: s.liquidity,
      founder: s.founder,
      team: s.team,
      earlyUsers: s.earlyUsers,
      grantsBugBounty: s.grantsBugBounty,
    },
  };
  // A local rehearsal deploys its own Safe contracts; every other chain uses the canonical ones.
  if (local) config.safe = { singletons: [record.singleton] };
  return config;
}
