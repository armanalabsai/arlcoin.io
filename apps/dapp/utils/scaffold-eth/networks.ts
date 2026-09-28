// Adapted from Scaffold-ETH 2 (MIT, BuidlGuidl): packages/nextjs/utils/scaffold-eth/networks.ts.
// ARL: hosted RPC (Alchemy) URLs and the multi-chain colour table removed.
import type * as chains from "viem/chains";

import { LOCAL_CHAIN_ID } from "~~/lib/network";
import type scaffoldConfig from "~~/scaffold.config";
import config from "~~/scaffold.config";

type ChainAttributes = {
  color: string;
};

export type ChainWithAttributes = chains.Chain & Partial<ChainAttributes>;
export type AllowedChainIds = (typeof scaffoldConfig.targetNetworks)[number]["id"];

export const NETWORKS_EXTRA_DATA: Record<string, ChainAttributes> = {
  [LOCAL_CHAIN_ID]: { color: "#e8b04b" },
};

/** Block explorer link for a transaction; empty on the local chain, which has none. */
export function getBlockExplorerTxLink(chainId: number, txnHash: string) {
  const chain = config.targetNetworks.find((network) => network.id === chainId);
  const url = chain?.blockExplorers?.default.url;
  return url ? `${url}/tx/${txnHash}` : "";
}

/** Target networks from scaffold.config with their display attributes. */
export function getTargetNetworks(): ChainWithAttributes[] {
  return config.targetNetworks.map((targetNetwork) => ({
    ...targetNetwork,
    ...NETWORKS_EXTRA_DATA[targetNetwork.id],
  }));
}
