// Adapted from Scaffold-ETH 2 (MIT, BuidlGuidl): packages/nextjs/services/web3/wagmiConfig.tsx.
// ARL: the target networks only (Scaffold-ETH also adds Ethereum Mainnet for ENS and prices);
// each chain uses its own configured RPC, with no hosted fallback.
import { createClient, http } from "viem";
import { createConfig } from "wagmi";

import scaffoldConfig from "~~/scaffold.config";
import { wagmiConnectors } from "~~/services/web3/wagmiConnectors";

export const enabledChains = scaffoldConfig.targetNetworks;

export const wagmiConfig = createConfig({
  chains: enabledChains,
  connectors: wagmiConnectors(),
  ssr: true,
  client({ chain }) {
    return createClient({
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
      pollingInterval: scaffoldConfig.pollingInterval,
    });
  },
});
