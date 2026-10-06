// Adapted from Scaffold-ETH 2 (MIT, BuidlGuidl): packages/nextjs/services/web3/wagmiConnectors.tsx.
// ARL: the common Base wallets (Coinbase Wallet, MetaMask, Rabby, Rainbow, Trust, OKX, Phantom)
// plus any other browser wallet (EIP-6963 / injected). Mobile wallets connect through
// WalletConnect only when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set (a free Reown project id);
// there is no burner wallet that keeps a private key in the browser. The Anvil development
// account is offered on the local chain.
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  phantomWallet,
  rabbyWallet,
  rainbowWallet,
  trustWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";

import { LOCAL_CHAIN_ID } from "~~/lib/network";
import scaffoldConfig from "~~/scaffold.config";
import { localDevWallet } from "~~/services/web3/localDevWallet";

const onlyLocal = scaffoldConfig.targetNetworks.every((network) => network.id === LOCAL_CHAIN_ID);
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

export const wagmiConnectors = () => {
  // Connectors are created in the browser only (RainbowKit reads `window`).
  if (typeof window === "undefined") return [];

  return connectorsForWallets(
    [
      {
        groupName: "Popular",
        wallets: [coinbaseWallet, metaMaskWallet, rabbyWallet, rainbowWallet],
      },
      {
        groupName: "More wallets",
        wallets: [
          trustWallet,
          okxWallet,
          phantomWallet,
          injectedWallet,
          ...(walletConnectProjectId ? [walletConnectWallet] : []),
        ],
      },
      ...(onlyLocal ? [{ groupName: "Local development", wallets: [localDevWallet] }] : []),
    ],
    {
      appName: "ARL",
      // Without a project id, wallets that need the WalletConnect relay fall back to their
      // browser extension; the placeholder is never sent to a relay.
      projectId: walletConnectProjectId || "arl-no-walletconnect",
    },
  );
};
