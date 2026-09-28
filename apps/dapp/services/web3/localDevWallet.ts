// A RainbowKit wallet entry for Anvil's development account on the local chain.
//
// Anvil unlocks its publicly known development accounts, so transactions are sent with
// `eth_sendTransaction` and signed by the local node. No private key exists in the browser.
// The entry is offered only when the app targets the local chain.
import type { Wallet } from "@rainbow-me/rainbowkit";
import { createConnector } from "wagmi";
import { mock } from "wagmi/connectors";

/** Anvil development account 1, the demo user of the local fixture (contracts/script/DevDapp.s.sol). */
export const LOCAL_DEV_ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

const ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#101a3a"/><path d="M16 7 8 25h4l4-9 4 9h4z" fill="#e8b04b"/></svg>',
  );

export const localDevWallet = (): Wallet => ({
  id: "arl-local-dev",
  name: "Local dev account",
  iconUrl: ICON,
  iconBackground: "#101a3a",
  createConnector: (walletDetails) =>
    createConnector((config) => ({
      ...mock({ accounts: [LOCAL_DEV_ACCOUNT], features: { reconnect: true } })(config),
      ...walletDetails,
    })),
});
