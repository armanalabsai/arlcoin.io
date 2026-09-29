// Networks on which ARL payments may run, with every external contract they depend on pinned.
//
// The x402 upto path is: ARL (EIP-2612) → Permit2 → x402UptoPermit2Proxy → facilitator. Both
// contracts are deployed by third parties; ARL deploys neither. Their addresses and runtime code
// hashes are pinned here and checked by the fork tests (contracts/test-fork) and, at runtime, by
// `assertPinnedCode`.

export interface PaymentNetwork {
  /** CAIP-2 identifier used by x402 v2. */
  network: `eip155:${number}`;
  chainId: number;
  permit2: `0x${string}`;
  permit2Codehash: `0x${string}`;
  uptoProxy: `0x${string}`;
  uptoProxyCodehash: `0x${string}`;
}

/** x402-foundation/x402 @ 71eb9a55e081e7b81ba3046d0bd17c3eb9c7bf81 (npm @x402/* 2.27.0). */
export const X402_SOURCE_COMMIT = "71eb9a55e081e7b81ba3046d0bd17c3eb9c7bf81";

export const BASE_SEPOLIA: PaymentNetwork = {
  network: "eip155:84532",
  chainId: 84_532,
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  permit2Codehash: "0xdcde65555316946c298e4c60c6213eb5c3aeab4354d1f3fac5427236bcbb9ebe",
  uptoProxy: "0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002",
  uptoProxyCodehash: "0x4662dc27323421a3698be49ac95f7b0dba141c238d31ef543248d1a11f8d8eec",
};

export const BASE_MAINNET_CHAIN_ID = 8453;

export class PaymentNetworkLocked extends Error {}
export class PaymentNetworkUnsupported extends Error {}

/**
 * The payments network gate. Mirrors the deployment gate: Base Sepolia only. Base Mainnet is
 * refused unconditionally, and no option, flag or environment variable changes that.
 */
export function paymentNetwork(chainId: number): PaymentNetwork {
  if (chainId === BASE_MAINNET_CHAIN_ID) {
    throw new PaymentNetworkLocked("Base Mainnet (8453) is locked for ARL payments");
  }
  if (chainId === BASE_SEPOLIA.chainId) return BASE_SEPOLIA;
  throw new PaymentNetworkUnsupported(`chain ${String(chainId)} is not supported for ARL payments`);
}

/** Reads the runtime code hashes of Permit2 and the upto proxy and compares them with the pins. */
export async function assertPinnedCode(
  net: PaymentNetwork,
  codehashOf: (address: `0x${string}`) => Promise<`0x${string}`>,
): Promise<void> {
  const permit2 = await codehashOf(net.permit2);
  if (permit2.toLowerCase() !== net.permit2Codehash) {
    throw new Error(`Permit2 code at ${net.permit2} does not match the pinned hash`);
  }
  const proxy = await codehashOf(net.uptoProxy);
  if (proxy.toLowerCase() !== net.uptoProxyCodehash) {
    throw new Error(`x402 upto proxy code at ${net.uptoProxy} does not match the pinned hash`);
  }
}
