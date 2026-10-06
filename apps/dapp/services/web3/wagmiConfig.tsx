// Adapted from Scaffold-ETH 2 (MIT, BuidlGuidl): packages/nextjs/services/web3/wagmiConfig.tsx.
// ARL: the target networks for the ARL contracts, plus Base Mainnet for the Trade page, which
// only reads Uniswap and sends swaps from the user's wallet. Each chain uses its own RPC.
import { createClient, http } from "viem";
import { base } from "viem/chains";
import { createConfig } from "wagmi";

import scaffoldConfig from "~~/scaffold.config";
import { wagmiConnectors } from "~~/services/web3/wagmiConnectors";

export const enabledChains = scaffoldConfig.targetNetworks;

const BASE_RPC = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org";

export const wagmiConfig = createConfig({
  chains: [...enabledChains, base],
  connectors: wagmiConnectors(),
  ssr: true,
  client({ chain }) {
    return createClient({
      chain,
      transport: http(chain.id === base.id ? BASE_RPC : chain.rpcUrls.default.http[0]),
      pollingInterval: scaffoldConfig.pollingInterval,
    });
  },
});
