// The ARL token list (Uniswap token-lists schema, https://tokenlists.org), published at
// arlcoin.io/tokenlist.json once the token is on Base Mainnet. Wallets and DEX front ends that
// accept a list URL show ARL with its name, symbol, decimals and logo from it.

import { getAddress, isAddress } from "viem";

export class TokenListError extends Error {}

export const TOKEN_LOGO = "https://arlcoin.io/arl-token.svg";

export interface TokenList {
  readonly name: string;
  readonly timestamp: string;
  readonly version: { readonly major: number; readonly minor: number; readonly patch: number };
  readonly logoURI: string;
  readonly keywords: readonly string[];
  readonly tokens: readonly {
    readonly chainId: number;
    readonly address: string;
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
    readonly logoURI: string;
  }[];
}

/** One entry per deployed ARL token: `{ chainId: address }`, e.g. `{ 8453: "0x..." }`. */
export function buildTokenList(tokens: Record<number, string>, timestamp: Date): TokenList {
  const entries = Object.entries(tokens).map(([chain, address]) => {
    const chainId = Number(chain);
    if (chainId !== 8453 && chainId !== 84532) {
      throw new TokenListError(`chainId ${chain}: only Base (8453) and Base Sepolia (84532)`);
    }
    if (!isAddress(address, { strict: false }) || /^0x0{40}$/i.test(address)) {
      throw new TokenListError(`chainId ${chain}: not a token address`);
    }
    return {
      chainId,
      address: getAddress(address),
      name: "ARL",
      symbol: "ARL",
      decimals: 18,
      logoURI: TOKEN_LOGO,
    };
  });
  if (entries.length === 0) throw new TokenListError("no tokens");
  return {
    name: "ARL Protocol",
    timestamp: timestamp.toISOString(),
    version: { major: 1, minor: 0, patch: 0 },
    logoURI: TOKEN_LOGO,
    keywords: ["arl", "base"],
    tokens: entries,
  };
}
