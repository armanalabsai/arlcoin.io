// Adapted from Scaffold-ETH 2 (MIT, BuidlGuidl): packages/nextjs/scaffold.config.ts.
// ARL: local Anvil chain only; no hosted RPC keys, no WalletConnect project, no burner wallet.
import type { Chain } from "viem";

import { assertAllowedChain, localChain } from "~~/lib/network";

export type ScaffoldConfig = {
  targetNetworks: readonly Chain[];
  pollingInterval: number;
};

const targetNetworks = [localChain(process.env.NEXT_PUBLIC_ARL_RPC_URL)] as const;
for (const network of targetNetworks) assertAllowedChain(network.id);

const scaffoldConfig = {
  targetNetworks,
  pollingInterval: 2000,
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
