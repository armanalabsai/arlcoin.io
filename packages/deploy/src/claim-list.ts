// The claim list the app serves as `apps/dapp/public/claims/<chainId>.json`: a distribution file
// (distribution.ts) together with the distributor that pays it. It is built only after the
// deployed distributor is read on chain and its token, root and deadline match, so the page is
// never handed a list that the contract would not honour. The page checks the same again.

import { getAddress, isAddress, parseAbi, type Address, type Hex } from "viem";

import { DistributionError, verifyDistribution, type Distribution } from "./distribution.ts";

export const CLAIM_LIST_SCHEMA = "arl-claim-list/1";

/** Networks a claim list may be published for: Base Mainnet, Base Sepolia and local Anvil. */
export const CLAIM_CHAINS = [8453, 84532, 31337] as const;

export const distributorReadAbi = parseAbi([
  "function token() view returns (address)",
  "function merkleRoot() view returns (bytes32)",
  "function claimEnd() view returns (uint64)",
]);

export interface ClaimListFile {
  schema: typeof CLAIM_LIST_SCHEMA;
  chainId: number;
  distributor: Address;
  token: Address;
  claimEnd: number;
  distribution: Distribution;
}

export interface DistributorState {
  chainId: number;
  /** Runtime code at the distributor address; "0x" when there is none. */
  code: Hex;
  token: Address;
  merkleRoot: Hex;
  claimEnd: bigint;
  /** The distributor's ARL balance. */
  balance: bigint;
  /** Latest block timestamp. */
  now: bigint;
}

function fail(message: string): never {
  throw new DistributionError(message);
}

/**
 * Builds the published list. Refuses an unsupported network, a distributor without code, a
 * different root or token, a closed window, or a balance that cannot pay every claim.
 */
export function buildClaimList(
  distribution: Distribution,
  distributor: string,
  expectedToken: string,
  chain: DistributorState,
): ClaimListFile {
  if (!(CLAIM_CHAINS as readonly number[]).includes(chain.chainId)) {
    fail(`chain ${String(chain.chainId)}: claim lists are published only for Base and local Anvil`);
  }
  if (!isAddress(distributor, { strict: false })) fail("distributor: invalid address");
  if (!isAddress(expectedToken, { strict: false })) fail("token: invalid address");
  verifyDistribution(distribution);
  if (chain.code === "0x") fail("distributor: no contract at the address");
  if (chain.merkleRoot.toLowerCase() !== distribution.merkleRoot.toLowerCase()) {
    fail("distributor: its root is not the distribution's root");
  }
  if (getAddress(chain.token) !== getAddress(expectedToken)) {
    fail("distributor: it pays a different token");
  }
  if (chain.claimEnd <= chain.now) fail("distributor: the claim window has closed");
  if (chain.balance < BigInt(distribution.total)) {
    fail(
      `distributor: balance ${chain.balance.toString()} cannot pay the list total ${distribution.total}`,
    );
  }
  return {
    schema: CLAIM_LIST_SCHEMA,
    chainId: chain.chainId,
    distributor: getAddress(distributor),
    token: getAddress(expectedToken),
    claimEnd: Number(chain.claimEnd),
    distribution,
  };
}
