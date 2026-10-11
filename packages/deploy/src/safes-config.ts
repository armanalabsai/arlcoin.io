// Builds a deployment config from the Safes created by `CreateSafes.s.sol`.
//
// The Safe addresses come only from a verified Safes record (`record-cli.ts safes`), never from
// what a script simulated: a record without the tool's stamp is refused.
//
// Every value except the Safe addresses is fixed here: code checks on, the approved 12 + 36 month
// vesting durations, and the 48-hour timelock floor. The vesting start is a placeholder, which
// the network gate accepts on local Anvil and Base Sepolia, and on Base Mainnet from the TGE.

import {
  LOCAL_CHAIN_ID,
  PRODUCTION_CHAIN_ID,
  TESTNET_CHAIN_ID,
  PlanError,
  networkGate,
  type DeployConfig,
} from "./plan.ts";
import { RecordError, requireVerified, type VerifiedStamp } from "./record.ts";

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
  /** Written by `record-cli.ts safes` after checking every Safe on chain. */
  verified?: VerifiedStamp;
}

const UTC_DAY = /^\d{4}-\d{2}-(0[1-9]|1\d|2[0-8])T00:00:00Z$/;

function fail(message: string): never {
  throw new PlanError(message);
}

/**
 * @param vestingStart Placeholder TGE, `YYYY-MM-DDT00:00:00Z` with day 1-28. Every vesting schedule
 *   starts at the TGE (VESTING_START = TGE_TIMESTAMP). The approved TGE is `TGE_DATE` (2026-11-01) in `@arl/tokenomics`; this value
 *   is accepted only on local Anvil and Base Sepolia.
 */
export function configFromSafes(record: SafesRecord, vestingStart: string): DeployConfig {
  networkGate(record.chainId);
  try {
    requireVerified(record, "safes");
  } catch (error) {
    fail(error instanceof RecordError ? error.message : String(error));
  }
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
    cliffMonths: 12,
    vestingMonths: 36,
  });
  const config: DeployConfig = {
    network:
      record.chainId === TESTNET_CHAIN_ID
        ? "base-sepolia"
        : record.chainId === PRODUCTION_CHAIN_ID
          ? "base"
          : "local",
    chainId: record.chainId,
    requireRecipientCode: true,
    note: `Safes created by CreateSafes.s.sol. The TGE ${vestingStart} is a testnet placeholder; the approved TGE is 2026-11-01. Every vesting schedule starts at the TGE.`,
    tge: vestingStart,
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
