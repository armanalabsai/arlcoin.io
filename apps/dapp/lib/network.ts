// Network gate for the ARL web app.
//
// The app runs on Base Mainnet (8453), and on a local Anvil chain (31337) for development and
// tests. Base Mainnet opens at the approved TGE, 2026-10-23T00:00:00Z (owner approval 2026-10-05),
// the same moment the contract tooling's `networkGate` opens it; before that it is refused. Every
// other chain is refused: there is no setting that enables them.

import { defineChain } from "viem";
import { base, foundry } from "viem/chains";

export const LOCAL_CHAIN_ID = 31_337;
export const BASE_MAINNET_CHAIN_ID = 8_453;

export const DEFAULT_LOCAL_RPC = "http://127.0.0.1:8545";

/** The approved TGE; Base Mainnet opens at this moment. */
export const TGE_DATE = "2026-10-23T00:00:00Z";

export class NetworkLocked extends Error {
  constructor(chainId: number) {
    super(`chain ${String(chainId)} is locked until the TGE ${TGE_DATE}`);
    this.name = "NetworkLocked";
  }
}

export class NetworkUnsupported extends Error {
  constructor(chainId: number) {
    super(`chain ${String(chainId)} is not supported by the ARL app`);
    this.name = "NetworkUnsupported";
  }
}

/** Throws unless `chainId` is one the app may target at `nowMs`. */
export function assertAllowedChain(chainId: number, nowMs: number = Date.now()): void {
  if (chainId === BASE_MAINNET_CHAIN_ID) {
    if (nowMs < Date.parse(TGE_DATE)) throw new NetworkLocked(chainId);
    return;
  }
  if (chainId !== LOCAL_CHAIN_ID) throw new NetworkUnsupported(chainId);
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

/**
 * Public Base Mainnet endpoints, tried in order. publicnode answers eth_getLogs over 50,000 blocks
 * (lib/logs.ts reads history in such ranges); Base's own endpoint refuses history reads.
 */
export const BASE_MAINNET_RPCS = [
  "https://base-rpc.publicnode.com",
  "https://mainnet.base.org",
  "https://base.gateway.tenderly.co",
] as const;

/**
 * Base Mainnet, served by `rpcUrl` when given, else by the public endpoints. A local URL (a fork
 * on this machine) is used alone, so a failing fork can never fall back to the real network; an
 * https endpoint is tried first, then the public ones.
 */
export function baseMainnetChain(rpcUrl?: string) {
  let urls: string[] = [...BASE_MAINNET_RPCS];
  if (rpcUrl) {
    const url = new URL(rpcUrl);
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (local) urls = [rpcUrl];
    else if (url.protocol === "https:") urls = [rpcUrl, ...BASE_MAINNET_RPCS];
    else throw new Error("the Base Mainnet RPC must be an https endpoint or a local fork");
  }
  return defineChain({ ...base, rpcUrls: { default: { http: urls } } });
}

/**
 * The chain the app is built for: NEXT_PUBLIC_ARL_CHAIN, 31337 (local Anvil, the default) or
 * 8453 (Base Mainnet). Anything else is refused at build time.
 */
export function appChain(chain: string | undefined, rpcUrl: string | undefined) {
  const id = chain === undefined || chain === "" ? LOCAL_CHAIN_ID : Number(chain);
  if (id === LOCAL_CHAIN_ID) return localChain(rpcUrl || DEFAULT_LOCAL_RPC);
  if (id === BASE_MAINNET_CHAIN_ID) return baseMainnetChain(rpcUrl);
  throw new NetworkUnsupported(id);
}
