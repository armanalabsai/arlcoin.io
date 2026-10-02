// Source verification on the block explorer (Basescan) for a deployment.
//
// Builds, from the plan and the deployment record, the exact constructor arguments each contract
// was created with and the `forge verify-contract` command that publishes its source. The
// arguments can be checked against the deployment's own broadcast file, so what is submitted is
// what was deployed. The explorer API key is read by Foundry from `ETHERSCAN_API_KEY`; it is
// never an argument here and never printed.

import { encodeAbiParameters, getAddress, type Address, type Hex } from "viem";

import type { DeploymentRecord } from "./manifest.ts";
import { networkGate, type DeployPlan } from "./plan.ts";

export interface ExplorerTarget {
  label: string;
  /** `path:Contract` as Foundry expects it. */
  contract: string;
  address: Address;
  constructorArgs: Hex;
}

export class ExplorerError extends Error {
  override name = "ExplorerError";
}

const vestingArgs = (v: DeployPlan["vesting"]["investors"]) =>
  encodeAbiParameters(
    [{ type: "address" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }],
    [getAddress(v.beneficiary), BigInt(v.cliffStart), BigInt(v.cliffEnd), BigInt(v.vestingEnd)],
  );

/** Every contract `DeployARL` creates, with the arguments it passed to each constructor. */
export function explorerTargets(plan: DeployPlan, d: DeploymentRecord): ExplorerTarget[] {
  networkGate(plan.chainId);
  if (d.chainId !== plan.chainId) throw new ExplorerError("deployment chain differs from plan");
  const r = plan.recipients;
  const safe = getAddress(plan.treasury.safe);
  return [
    {
      label: "investors vesting",
      contract: "src/ARLVestingWallet.sol:ARLVestingWallet",
      address: getAddress(d.investorsVesting),
      constructorArgs: vestingArgs(plan.vesting.investors),
    },
    {
      label: "strategic partnerships vesting",
      contract: "src/ARLVestingWallet.sol:ARLVestingWallet",
      address: getAddress(d.partnershipsVesting),
      constructorArgs: vestingArgs(plan.vesting.strategicPartnerships),
    },
    {
      label: "treasury timelock",
      contract: "src/ARLTimelock.sol:ARLTimelock",
      address: getAddress(d.timelock),
      constructorArgs: encodeAbiParameters(
        [{ type: "uint256" }, { type: "address[]" }, { type: "address[]" }, { type: "address" }],
        [BigInt(plan.treasury.minDelay), [safe], [safe], getAddress(plan.treasury.guardian)],
      ),
    },
    {
      label: "token",
      contract: "src/ARLToken.sol:ARLToken",
      address: getAddress(d.token),
      // ARLToken.Recipients, in struct order.
      constructorArgs: encodeAbiParameters(
        [{ type: "tuple", components: Array.from({ length: 11 }, () => ({ type: "address" })) }],
        [
          [
            r.publicLaunch,
            r.communityStaking,
            r.ecosystemGrowth,
            d.partnershipsVesting,
            r.liquidity,
            r.founder,
            d.investorsVesting,
            d.timelock,
            r.team,
            r.earlyUsers,
            r.grantsBugBounty,
          ].map((a) => getAddress(a)),
        ] as never,
      ),
    },
  ];
}

/** The `forge verify-contract` arguments for one target (run in `contracts/`). */
export function verifyCommand(chainId: number, t: ExplorerTarget): string[] {
  networkGate(chainId);
  return [
    "verify-contract",
    "--chain",
    String(chainId),
    "--verifier",
    "etherscan",
    "--watch",
    "--constructor-args",
    t.constructorArgs,
    t.address,
    t.contract,
  ];
}

interface BroadcastRun {
  transactions?: {
    transactionType?: string;
    contractAddress?: string;
    transaction?: { input?: string };
  }[];
}

/**
 * Checks the arguments against the deployment's broadcast file: every contract creation there
 * must be one of the targets, and its creation input must end with exactly these arguments.
 * Returns the problems found; empty when everything agrees.
 */
export function checkAgainstBroadcast(targets: ExplorerTarget[], run: BroadcastRun): string[] {
  const problems: string[] = [];
  const creates = (run.transactions ?? []).filter((t) => t.transactionType === "CREATE");
  for (const t of targets) {
    const tx = creates.find(
      (c) => c.contractAddress && getAddress(c.contractAddress) === t.address,
    );
    const input = tx?.transaction?.input?.toLowerCase();
    if (!input) problems.push(`${t.label}: no creation of ${t.address} in the broadcast`);
    else if (!input.endsWith(t.constructorArgs.slice(2).toLowerCase())) {
      problems.push(`${t.label}: constructor arguments differ from the broadcast`);
    }
  }
  if (creates.length !== targets.length) {
    problems.push(
      `broadcast creates ${String(creates.length)} contracts, expected ${String(targets.length)}`,
    );
  }
  return problems;
}
