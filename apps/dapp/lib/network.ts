// Network gate for the ARL web app.
//
// The app runs on a local Anvil chain (31337). Base Sepolia (84532) is the only other chain it
// may ever be configured for, once contracts are deployed there with the owner's approval. Base
// Mainnet (8453) and every other chain are refused: there is no setting that enables them.

import { defineChain } from "viem";
import { foundry } from "viem/chains";

export const LOCAL_CHAIN_ID = 31_337;
export const BASE_SEPOLIA_CHAIN_ID = 84_532;
export const BASE_MAINNET_CHAIN_ID = 8_453;

export const DEFAULT_LOCAL_RPC = "http://127.0.0.1:8545";

export class NetworkLocked extends Error {
  constructor(chainId: number) {
    super(`chain ${String(chainId)} is locked: the ARL app never targets Base Mainnet`);
    this.name = "NetworkLocked";
  }
}

export class NetworkUnsupported extends Error {
  constructor(chainId: number) {
    super(`chain ${String(chainId)} is not supported by the ARL app`);
    this.name = "NetworkUnsupported";
  }
}

/** Throws unless `chainId` is one the app may target. */
export function assertAllowedChain(chainId: number): void {
  if (chainId === BASE_MAINNET_CHAIN_ID) throw new NetworkLocked(chainId);
  if (chainId !== LOCAL_CHAIN_ID && chainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new NetworkUnsupported(chainId);
  }
}

/** The local Anvil chain, served at `rpcUrl`. */
export function localChain(rpcUrl: string = DEFAULT_LOCAL_RPC) {
  const url = new URL(rpcUrl);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(`the local chain must be served from this machine, not ${url.hostname}`);
  }
  return defineChain({
    ...foundry,
    name: "ARL Local (Anvil)",
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}
