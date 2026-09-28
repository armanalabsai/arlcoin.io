// Adapted from Scaffold-ETH 2 (MIT, BuidlGuidl): packages/nextjs/hooks/scaffold-eth/useNetworkColor.ts.
// ARL: a single (dark) theme, so no theme lookup.
import { useSelectedNetwork } from "~~/hooks/scaffold-eth";
import type { AllowedChainIds, ChainWithAttributes } from "~~/utils/scaffold-eth";

export const DEFAULT_NETWORK_COLOR = "#bbbbbb";

export function getNetworkColor(network: ChainWithAttributes) {
  return network.color ?? DEFAULT_NETWORK_COLOR;
}

/** Colour of the target network. */
export const useNetworkColor = (chainId?: AllowedChainIds) =>
  getNetworkColor(useSelectedNetwork(chainId));
