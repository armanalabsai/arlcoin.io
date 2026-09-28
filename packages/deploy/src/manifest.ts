// Builds the official deployment manifest: the published list of every address that holds ARL
// at genesis or is protocol-controlled, and whether its balance counts as circulating
// (economic specification section 5).
//
// Circulating Supply = totalSupply - balances held by protocol-controlled or locked addresses.

import type { DeployPlan } from "./plan.ts";

export const MANIFEST_SCHEMA = "arl-deployment-manifest/1";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Addresses written by `DeployARL` (`contracts/deploy/deployments/<chainId>.json`). */
export interface DeploymentRecord {
  chainId: number;
  deployer: string;
  token: string;
  investorsVesting: string;
  partnershipsVesting: string;
  timelock: string;
}

export interface ManifestHolder {
  role: string;
  address: string;
  /** False: the balance is subtracted from total supply (protocol-controlled or locked). */
  circulating: boolean;
  reason: string;
}

export interface DeploymentManifest {
  schema: typeof MANIFEST_SCHEMA;
  chainId: number;
  token: string;
  maxSupply: string;
  holders: ManifestHolder[];
}

export class ManifestError extends Error {
  override name = "ManifestError";
}

function fail(message: string): never {
  throw new ManifestError(message);
}

function requireAddress(value: unknown, field: string): string {
  if (typeof value !== "string" || !ADDRESS.test(value)) fail(`${field}: not an address`);
  return value;
}

const SAFE = "protocol-controlled Safe";

export function buildManifest(plan: DeployPlan, deployment: DeploymentRecord): DeploymentManifest {
  if (deployment.chainId !== plan.chainId) {
    fail(`deployment chainId ${String(deployment.chainId)} differs from plan chainId`);
  }
  const r = plan.recipients;
  const holders: ManifestHolder[] = [
    { role: "publicLaunch", address: r.publicLaunch, circulating: false, reason: SAFE },
    { role: "communityStaking", address: r.communityStaking, circulating: false, reason: SAFE },
    { role: "ecosystemGrowth", address: r.ecosystemGrowth, circulating: false, reason: SAFE },
    { role: "liquidity", address: r.liquidity, circulating: false, reason: SAFE },
    { role: "teamPool", address: r.team, circulating: false, reason: SAFE },
    { role: "earlyUsers", address: r.earlyUsers, circulating: false, reason: SAFE },
    { role: "grantsBugBounty", address: r.grantsBugBounty, circulating: false, reason: SAFE },
    {
      role: "investorsVesting",
      address: requireAddress(deployment.investorsVesting, "deployment.investorsVesting"),
      circulating: false,
      reason: "vesting wallet",
    },
    {
      role: "partnershipsVesting",
      address: requireAddress(deployment.partnershipsVesting, "deployment.partnershipsVesting"),
      circulating: false,
      reason: "vesting wallet",
    },
    {
      role: "treasuryTimelock",
      address: requireAddress(deployment.timelock, "deployment.timelock"),
      circulating: false,
      reason: "treasury timelock",
    },
    { role: "treasurySafe", address: plan.treasury.safe, circulating: false, reason: SAFE },
    { role: "treasuryGuardian", address: plan.treasury.guardian, circulating: false, reason: SAFE },
    {
      role: "founder",
      address: r.founder,
      circulating: true,
      reason: "unlocked at TGE; not a protocol-controlled address",
    },
  ];

  const seen = new Map<string, string>();
  for (const h of holders) {
    requireAddress(h.address, h.role);
    const other = seen.get(h.address.toLowerCase());
    if (other) fail(`${h.role}: same address as ${other}`);
    seen.set(h.address.toLowerCase(), h.role);
  }

  return {
    schema: MANIFEST_SCHEMA,
    chainId: plan.chainId,
    token: requireAddress(deployment.token, "deployment.token"),
    maxSupply: plan.maxSupply,
    holders,
  };
}
