// Adapted from Scaffold-ETH 2 (MIT, BuidlGuidl): packages/nextjs/services/web3/wagmiConfig.tsx.
// ARL: the target network for the ARL contracts, plus Base Mainnet for the Trade page in a local
// build (it only reads Uniswap and sends swaps from the user's wallet). The target network uses
// its public endpoints in order; Base for a local build uses NEXT_PUBLIC_BASE_RPC_URL.
import { createClient, fallback, http } from "viem";
import { base } from "viem/chains";
import { createConfig } from "wagmi";

import scaffoldConfig from "~~/scaffold.config";
import { wagmiConnectors } from "~~/services/web3/wagmiConnectors";

export const enabledChains = scaffoldConfig.targetNetworks;

const BASE_RPC = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org";

export const wagmiConfig = createConfig({
  chains: enabledChains.some((c) => c.id === base.id) ? enabledChains : [...enabledChains, base],
  connectors: wagmiConnectors(),
  ssr: true,
  client({ chain }) {
    return createClient({
      chain,
      // Several endpoints (the public Base Mainnet ones): try each in order.
      transport: enabledChains.some((c) => c.id === chain.id)
        ? fallback(chain.rpcUrls.default.http.map((url) => http(url)))
        : http(BASE_RPC),
      pollingInterval: scaffoldConfig.pollingInterval,
    });
  },
});
