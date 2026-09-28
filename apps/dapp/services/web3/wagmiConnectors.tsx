// Adapted from Scaffold-ETH 2 (MIT, BuidlGuidl): packages/nextjs/services/web3/wagmiConnectors.tsx.
// ARL: browser-extension wallets only (no WalletConnect relay, no burner wallet that keeps a
// private key in the browser); the Anvil development account is offered on the local chain.
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, rabbyWallet } from "@rainbow-me/rainbowkit/wallets";

import { LOCAL_CHAIN_ID } from "~~/lib/network";
import scaffoldConfig from "~~/scaffold.config";
import { localDevWallet } from "~~/services/web3/localDevWallet";

const onlyLocal = scaffoldConfig.targetNetworks.every((network) => network.id === LOCAL_CHAIN_ID);

export const wagmiConnectors = () => {
  // Connectors are created in the browser only (RainbowKit reads `window`).
  if (typeof window === "undefined") return [];

  return connectorsForWallets(
    [
      { groupName: "Browser wallets", wallets: [metaMaskWallet, rabbyWallet, injectedWallet] },
      ...(onlyLocal ? [{ groupName: "Local development", wallets: [localDevWallet] }] : []),
    ],
    // No WalletConnect project is configured; the id is required by the API but unused by
    // extension wallets.
    { appName: "ARL", projectId: "arl-no-walletconnect" },
  );
};
