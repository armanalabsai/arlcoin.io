import { type Address, type PublicClient, isAddressEqual } from "viem";

/**
 * What every read function accepts: a viem public client, or the `{ publicClient }` object the
 * write functions take. One client shape works across the package.
 */
export type ReadClient = PublicClient | { publicClient: PublicClient };

export function publicClientOf(c: ReadClient): PublicClient {
  return "publicClient" in c ? c.publicClient : c;
}

/**
 * Resolves "ARL", "USDC" or one of the listed addresses to the entry it names, so a job can be
 * addressed by its token or by its escrow.
 */
export function entryOf<T extends { token: string }>(
  entries: readonly T[],
  addresses: (entry: T) => readonly Address[],
  tokenOrAddress: string,
): T | undefined {
  const wanted = tokenOrAddress.trim();
  return entries.find(
    (e) =>
      e.token === wanted.toUpperCase() ||
      (wanted.startsWith("0x") &&
        wanted.length === 42 &&
        addresses(e).some((a) => isAddressEqual(a, wanted as Address))),
  );
}
