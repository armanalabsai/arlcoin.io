// The two Safe batches that bring the Base Sepolia ecosystem to life after
// DeploySepoliaEcosystem: the Community & Staking Safe funds one staking reward period, and the
// Ecosystem & Growth Safe funds the testnet operator (faucet and demo services). Base Sepolia
// only; every amount is testnet ARL. Nothing is sent: the Safe owner imports each batch in the
// Safe{Wallet} Transaction Builder, checks it and signs it.

import { encodeFunctionData, getAddress, isAddress, parseAbi, type Address, type Hex } from "viem";

export const SEPOLIA_CHAIN_ID = 84_532;

/** The testnet ARL token and the testnet Safes that hold its allocations (docs/audit-evidence.md). */
export const SEPOLIA = {
  token: "0x244312b619127B6458154F3467eFD7c87CD28500",
  communityStakingSafe: "0x6e7bD80144ea10e5E1FcF95Fc4B044415CFE61d4",
  ecosystemGrowthSafe: "0xd1c0ABd6D9C149b66A1c27C694c5a9bDaaF1b229",
} as const satisfies Record<string, Address>;

/** One reward period: 30,000 ARL over the contract's 30 days. */
export const STAKING_REWARD = 30_000n * 10n ** 18n;
/** The operator's float: the faucet and the demo services pay from it. */
export const OPERATOR_FLOAT = 200_000n * 10n ** 18n;

const erc20 = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);
const staking = parseAbi(["function notifyRewardAmount(uint256 reward)"]);

export class SepoliaEcosystemError extends Error {
  override name = "SepoliaEcosystemError";
}

export interface EcosystemDeployment {
  chainId: number;
  token: string;
  rewardsDistribution: string;
  staking: string;
  jobs: string;
}

interface Call {
  to: Address;
  data: Hex;
  description: string;
}

export interface SafeBatch {
  version: "1.0";
  chainId: string;
  createdAt: number;
  meta: {
    name: string;
    description: string;
    txBuilderVersion: string;
    createdFromSafeAddress: Address;
    createdFromOwnerAddress: string;
  };
  transactions: {
    to: Address;
    value: "0";
    data: Hex;
    contractMethod: null;
    contractInputsValues: null;
  }[];
}

function address(value: string, what: string): Address {
  if (!isAddress(value, { strict: false }) || /^0x0{40}$/i.test(value)) {
    throw new SepoliaEcosystemError(`${what} is not an address: ${value}`);
  }
  return getAddress(value);
}

function batch(safe: Address, name: string, calls: Call[], createdAt: number): SafeBatch {
  return {
    version: "1.0",
    chainId: String(SEPOLIA_CHAIN_ID),
    createdAt,
    meta: {
      name,
      description: calls.map((c, i) => `${String(i + 1)}. ${c.description}`).join(" "),
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: safe,
      createdFromOwnerAddress: "",
    },
    transactions: calls.map((c) => ({
      to: c.to,
      value: "0",
      data: c.data,
      contractMethod: null,
      contractInputsValues: null,
    })),
  };
}

/** Checks the deployment record against the known testnet addresses and builds both batches. */
export function ecosystemBatches(
  deployment: EcosystemDeployment,
  operator: string,
  createdAt: number,
): { community: SafeBatch; ecosystem: SafeBatch } {
  if (deployment.chainId !== SEPOLIA_CHAIN_ID) {
    throw new SepoliaEcosystemError(`deployment is for chain ${String(deployment.chainId)}`);
  }
  const token = address(deployment.token, "token");
  if (token !== SEPOLIA.token)
    throw new SepoliaEcosystemError("deployment token is not testnet ARL");
  if (
    address(deployment.rewardsDistribution, "rewardsDistribution") !== SEPOLIA.communityStakingSafe
  ) {
    throw new SepoliaEcosystemError("reward distributor is not the Community & Staking Safe");
  }
  const stakingAddress = address(deployment.staking, "staking");
  const op = address(operator, "operator");
  for (const safe of Object.values(SEPOLIA)) {
    if (op === safe || stakingAddress === safe) {
      throw new SepoliaEcosystemError("operator or staking equals a testnet Safe or the token");
    }
  }

  const community = batch(
    SEPOLIA.communityStakingSafe,
    "ARL testnet staking rewards (30,000 ARL over 30 days)",
    [
      {
        to: token,
        data: encodeFunctionData({
          abi: erc20,
          functionName: "approve",
          args: [stakingAddress, STAKING_REWARD],
        }),
        description: `Approve the staking contract ${stakingAddress} for exactly 30,000 ARL.`,
      },
      {
        to: stakingAddress,
        data: encodeFunctionData({
          abi: staking,
          functionName: "notifyRewardAmount",
          args: [STAKING_REWARD],
        }),
        description:
          "Start a 30-day reward period of 30,000 ARL (the contract pulls the approved amount).",
      },
    ],
    createdAt,
  );
  const ecosystem = batch(
    SEPOLIA.ecosystemGrowthSafe,
    "ARL testnet operator float (200,000 ARL)",
    [
      {
        to: token,
        data: encodeFunctionData({
          abi: erc20,
          functionName: "transfer",
          args: [op, OPERATOR_FLOAT],
        }),
        description: `Send 200,000 testnet ARL to the testnet operator ${op} (faucet and demo services).`,
      },
    ],
    createdAt,
  );
  return { community, ecosystem };
}
