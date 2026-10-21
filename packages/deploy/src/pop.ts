// Proof of personhood-free whitelist entry by wallet signature (docs/pop-whitelist.md).
//
// A user signs a typed message with their wallet; a server calls `verifyEntry`, which checks the
// signature (viem, EIP-712), the expiry and a one-time nonce, and returns a commitment to publish:
// keccak256(domain, address). No email or other personal data is part of the message. The server
// still sees the request's network metadata, so this is "no personal data collected by ARL", not
// anonymity from the operator.
//
// Honest limits: a commitment of a public address can be brute-forced against a list of known
// addresses, so it hides nothing from someone who already has the address. It makes the published
// list unreadable as a list of addresses, not unlinkable. For unlinkable membership use the
// Semaphore-based ARLAnonymousSignal (docs/zk-privacy.md).

import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";

export const POP_DOMAIN = { name: "ARL Whitelist", version: "1" } as const;
export const POP_TYPES = {
  Entry: [
    { name: "wallet", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;
/** Longest validity a signed entry may claim, in seconds. */
export const MAX_VALIDITY_SECONDS = 15 * 60;

export interface PopEntry {
  wallet: Address;
  /** 32 random bytes chosen by the signer; accepted once. */
  nonce: Hex;
  /** Unix seconds. */
  expiresAt: bigint;
  signature: Hex;
}

export class PopError extends Error {
  override name = "PopError";
  readonly code: "BAD_INPUT" | "EXPIRED" | "BAD_SIGNATURE" | "REPLAY";
  constructor(code: "BAD_INPUT" | "EXPIRED" | "BAD_SIGNATURE" | "REPLAY") {
    super(code);
    this.code = code;
  }
}

/** Remembers used nonces. A production store must be atomic (one insert wins). */
export interface NonceStore {
  /** True if the nonce was new and is now recorded; false if it was already used. */
  use(nonce: Hex): boolean | Promise<boolean>;
}

export class MemoryNonceStore implements NonceStore {
  readonly #seen = new Set<string>();
  use(nonce: Hex): boolean {
    const k = nonce.toLowerCase();
    if (this.#seen.has(k)) return false;
    this.#seen.add(k);
    return true;
  }
}

/** The commitment published for a wallet: keccak256(abi.encode("ARL Whitelist v1", wallet)). */
export function commitment(wallet: Address): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "string" }, { type: "address" }], ["ARL Whitelist v1", wallet]),
  );
}

/**
 * Verifies a signed entry and records its nonce. Returns the wallet and its commitment.
 * Order matters: cheap checks first, the nonce is consumed only for a valid signature, so a
 * forged request cannot burn someone else's nonce.
 */
export async function verifyEntry(
  entry: PopEntry,
  nonces: NonceStore,
  nowSeconds: bigint,
): Promise<{ wallet: Address; commitment: Hex }> {
  if (
    !isAddress(entry.wallet) ||
    !/^0x[0-9a-fA-F]{64}$/.test(entry.nonce) ||
    !/^0x[0-9a-fA-F]+$/.test(entry.signature)
  ) {
    throw new PopError("BAD_INPUT");
  }
  if (
    entry.expiresAt <= nowSeconds ||
    entry.expiresAt > nowSeconds + BigInt(MAX_VALIDITY_SECONDS)
  ) {
    throw new PopError("EXPIRED");
  }
  let signer: Address;
  try {
    signer = await recoverTypedDataAddress({
      domain: POP_DOMAIN,
      types: POP_TYPES,
      primaryType: "Entry",
      message: { wallet: entry.wallet, nonce: entry.nonce, expiresAt: entry.expiresAt },
      signature: entry.signature,
    });
  } catch {
    throw new PopError("BAD_SIGNATURE");
  }
  if (getAddress(signer) !== getAddress(entry.wallet)) throw new PopError("BAD_SIGNATURE");
  if (!(await nonces.use(entry.nonce))) throw new PopError("REPLAY");
  const wallet = getAddress(entry.wallet);
  return { wallet, commitment: commitment(wallet) };
}
