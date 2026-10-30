// Buy an exact amount of ARL on Base Mainnet through the official Uniswap v3 pools (1% fee tier,
// docs/mainnet-plan.md), so an agent that holds ETH, USDC, USDT or cbBTC can pay a verified job.
//
//   await acquireArl(clients, { amountOut: parseUnits("100", 18), tokenIn: "ETH",
//     maxAmountIn: parseEther("0.02") });
//
// It quotes with QuoterV2, refuses a quote above `maxAmountIn`, then swaps with SwapRouter02
// `exactOutputSingle` (ETH is sent as value and wrapped by the router; the unused rest is
// refunded in the same transaction). Base Mainnet only, where the pools are.

import { encodeFunctionData, getAddress, parseAbi, type Address, type Hash } from "viem";

import { VerifiedJobError, walletAccount, type VerifiedClients } from "./verified.ts";

/** Base Mainnet contracts the swap uses (Uniswap v3 deployments, the ARL token and quote tokens). */
export const ARL_SWAP = {
  chainId: 8453,
  arl: "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4",
  fee: 10_000,
  router: "0x2626664c2603336E57B271c5C0b26F421741e481",
  quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  tokens: {
    ETH: "0x4200000000000000000000000000000000000006",
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  },
} as const;

export type ArlQuoteToken = keyof typeof ARL_SWAP.tokens;

const quoterAbi = parseAbi([
  "struct QuoteExactOutputSingleParams { address tokenIn; address tokenOut; uint256 amount; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactOutputSingle(QuoteExactOutputSingleParams params) returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
const routerAbi = parseAbi([
  "struct ExactOutputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountOut; uint256 amountInMaximum; uint160 sqrtPriceLimitX96; }",
  "function exactOutputSingle(ExactOutputSingleParams params) payable returns (uint256 amountIn)",
  "function refundETH() payable",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
]);
const erc20Abi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

export interface AcquireArlParams {
  /** Exact ARL to receive, in base units (18 decimals). */
  amountOut: bigint;
  tokenIn: ArlQuoteToken;
  /** Most of `tokenIn` the caller will spend, in its base units. */
  maxAmountIn: bigint;
  /** Who receives the ARL; defaults to the wallet's account. */
  recipient?: Address;
}

/** The amount of `tokenIn` needed for exactly `amountOut` ARL right now. */
export async function quoteArl(
  publicClient: VerifiedClients["publicClient"],
  tokenIn: ArlQuoteToken,
  amountOut: bigint,
): Promise<bigint> {
  await checkSwapChain(publicClient);
  const { result } = await publicClient.simulateContract({
    address: ARL_SWAP.quoter,
    abi: quoterAbi,
    functionName: "quoteExactOutputSingle",
    args: [
      {
        tokenIn: ARL_SWAP.tokens[tokenIn],
        tokenOut: ARL_SWAP.arl,
        amount: amountOut,
        fee: ARL_SWAP.fee,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  return result[0];
}

async function checkSwapChain(publicClient: VerifiedClients["publicClient"]): Promise<void> {
  const id = await publicClient.getChainId();
  if (id !== ARL_SWAP.chainId)
    throw new VerifiedJobError(`ARL pools are on Base Mainnet, not chain ${String(id)}`);
}

/** Buys exactly `amountOut` ARL with at most `maxAmountIn` of `tokenIn`. */
export async function acquireArl(
  { publicClient, walletClient }: VerifiedClients,
  p: AcquireArlParams,
): Promise<{ amountIn: bigint; swapTx: Hash }> {
  if (p.amountOut <= 0n || p.maxAmountIn <= 0n)
    throw new VerifiedJobError("amounts must be positive");
  const quoted = await quoteArl(publicClient, p.tokenIn, p.amountOut);
  if (quoted > p.maxAmountIn) {
    throw new VerifiedJobError(
      `the swap needs ${quoted.toString()} of ${p.tokenIn}, above maxAmountIn`,
    );
  }
  const from = walletAccount(walletClient);
  const recipient = getAddress(p.recipient ?? from.address);
  const tokenIn = ARL_SWAP.tokens[p.tokenIn];
  const native = p.tokenIn === "ETH";
  const wait = async (hash: Hash, what: string) => {
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new VerifiedJobError(`${what} reverted`);
  };
  if (!native) {
    const approveTx = await walletClient.writeContract({
      account: from,
      chain: walletClient.chain,
      address: tokenIn,
      abi: erc20Abi,
      functionName: "approve",
      args: [ARL_SWAP.router, p.maxAmountIn],
    });
    await wait(approveTx, "approve");
  }
  const swap = {
    tokenIn,
    tokenOut: ARL_SWAP.arl,
    fee: ARL_SWAP.fee,
    recipient,
    amountOut: p.amountOut,
    amountInMaximum: p.maxAmountIn,
    sqrtPriceLimitX96: 0n,
  } as const;
  const { request, result } = await publicClient.simulateContract({
    account: from,
    address: ARL_SWAP.router,
    abi: routerAbi,
    functionName: "exactOutputSingle",
    args: [swap],
    value: native ? p.maxAmountIn : 0n,
  });
  // With ETH, refundETH returns what the swap did not use, in the same transaction.
  const swapTx = native
    ? await walletClient.writeContract({
        account: from,
        chain: walletClient.chain,
        address: ARL_SWAP.router,
        abi: routerAbi,
        functionName: "multicall",
        args: [
          [
            encodeFunctionData({ abi: routerAbi, functionName: "exactOutputSingle", args: [swap] }),
            encodeFunctionData({ abi: routerAbi, functionName: "refundETH" }),
          ],
        ],
        value: p.maxAmountIn,
      })
    : await walletClient.writeContract({ ...request, chain: walletClient.chain });
  await wait(swapTx, "exactOutputSingle");
  return { amountIn: result, swapTx };
}
