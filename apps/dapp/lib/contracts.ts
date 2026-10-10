// The ARL contracts of the chain this build targets (scaffold.config.ts): the local fixture or the
// Base Sepolia record, both generated into contracts/deployedContracts.ts. A build for a chain
// without a record fails here instead of showing addresses of another chain.

import deployedContracts from "~~/contracts/deployedContracts";
import scaffoldConfig from "~~/scaffold.config";

type Deployments = typeof deployedContracts;
export type ArlContracts = Deployments[keyof Deployments];

export const ARL_CHAIN_ID: number = scaffoldConfig.targetNetworks[0].id;

const byChain = deployedContracts as Record<number, ArlContracts | undefined>;
const selected = byChain[ARL_CHAIN_ID];
if (!selected) throw new Error(`no ARL contracts are recorded for chain ${String(ARL_CHAIN_ID)}`);

export const ARL: ArlContracts = selected;

/** The block a contract was deployed in: event history starts there (0 on the local chain). */
export function deployBlock(contract: { address: string }): bigint {
  const block = (contract as { deployedOnBlock?: number }).deployedOnBlock;
  return BigInt(block ?? 0);
}

/** Whether this build runs on the local Anvil chain, where development accounts are unlocked. */
export const IS_LOCAL = ARL_CHAIN_ID === 31_337;

/** How often screens re-read chain state: every few seconds locally, gently on public RPCs. */
export const REFRESH_MS = IS_LOCAL ? 3_000 : 15_000;
