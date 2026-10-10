// Adapted from Scaffold-ETH 2 (MIT, BuidlGuidl): packages/nextjs/scaffold.config.ts.
// ARL: one target chain, chosen at build time by NEXT_PUBLIC_ARL_CHAIN: the local Anvil chain
// (default) or Base Sepolia. No hosted RPC keys, no burner wallet.
import type { Chain } from "viem";

import { appChain, assertAllowedChain } from "~~/lib/network";

export type ScaffoldConfig = {
  targetNetworks: readonly Chain[];
  pollingInterval: number;
};

const targetNetworks = [
  appChain(process.env.NEXT_PUBLIC_ARL_CHAIN, process.env.NEXT_PUBLIC_ARL_RPC_URL),
] as const;
for (const network of targetNetworks) assertAllowedChain(network.id);

const scaffoldConfig = {
  targetNetworks,
  pollingInterval: 2000,
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
