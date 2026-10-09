// Per-second compute payments over ComputePayment (contracts/src/ComputePayment.sol).
//
//   const stream = await streamComputePayment({ publicClient, walletClient }, {
//     chain: baseSepolia, contractAddress, providerAddress, tokenAddress,
//     ratePerSecond: parseUnits("0.01", 18), maxDurationSeconds: 3600, maxCap: parseUnits("36", 18) });
//
// The client escrows `ratePerSecond * maxDurationSeconds`, which must not exceed `maxCap`. The
// provider earns the rate every second until either party calls `stopComputeStream` or the
// duration runs out; the unearned rest goes back to the client.

import {
  BaseError,
  ContractFunctionRevertedError,
  erc20Abi,
  getAddress,
  isAddress,
  isAddressEqual,
  parseEventLogs,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";

import { computePaymentAbi } from "./abi.ts";

/** Base Mainnet is locked: the contract is not deployed there and no option unlocks it. */
export const BASE_MAINNET_CHAIN_ID = 8453;
/** Mirrors `ComputePayment.MAX_DURATION`. */
export const MAX_STREAM_DURATION_SECONDS = 365 * 24 * 60 * 60;
const MAX_UINT128 = 2n ** 128n - 1n;

export type StreamingErrorCode =
  | "NETWORK_LOCKED"
  | "CHAIN_MISMATCH"
  | "NO_ACCOUNT"
  | "INVALID_PARAMS"
  | "MAX_CAP_EXCEEDED"
  | "TOKEN_MISMATCH"
  | "INSUFFICIENT_BALANCE"
  | "TX_REVERTED"
  | "EVENT_MISSING";

export class StreamingError extends Error {
  readonly code: StreamingErrorCode;
  /** Custom error name decoded from the contract, when the failure is a contract revert. */
  readonly revertName: string | undefined;

  constructor(
    code: StreamingErrorCode,
    message: string,
    options: { cause?: unknown; revertName?: string } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "StreamingError";
    this.code = code;
    this.revertName = options.revertName;
  }
}

export interface StreamingClients {
  publicClient: PublicClient;
  walletClient: WalletClient;
}

export interface StreamComputePaymentParams {
  /** Chain the contract is deployed on. Base Mainnet (8453) is refused. */
  chain: Chain;
  /** The ComputePayment contract. */
  contractAddress: Address;
  /** The compute provider that receives the stream. */
  providerAddress: Address;
  /** The payment token (ARL); must be the contract's `paymentToken`. */
  tokenAddress: Address;
  /** Token base units earned by the provider per second. */
  ratePerSecond: bigint;
  /** Seconds after which accrual stops by itself. */
  maxDurationSeconds: number;
  /** The most the client accepts to escrow; `ratePerSecond * maxDurationSeconds` must not exceed it. */
  maxCap: bigint;
  /** Block confirmations to wait for on each transaction (default 1). */
  confirmations?: number;
}

export interface ComputeStream {
  streamId: bigint;
  sender: Address;
  provider: Address;
  ratePerSecond: bigint;
  deposit: bigint;
  startTime: bigint;
  endTime: bigint;
  txHash: Hash;
  /** Set when an approval had to be sent first. */
  approvalTxHash: Hash | undefined;
}

export interface StopComputeStreamParams {
  chain: Chain;
  contractAddress: Address;
  streamId: bigint;
  confirmations?: number;
}

export interface StreamSettlement {
  streamId: bigint;
  providerAmount: bigint;
  refundAmount: bigint;
  txHash: Hash;
}

/**
 * Validates the parameters offline and returns the deposit the stream will escrow. Throws a
 * `StreamingError` before anything is sent.
 */
export function planStream(params: StreamComputePaymentParams): { deposit: bigint } {
  if (params.chain.id === BASE_MAINNET_CHAIN_ID) {
    throw new StreamingError("NETWORK_LOCKED", "Base Mainnet (8453) is locked for ARL streaming");
  }
  for (const [name, value] of [
    ["contractAddress", params.contractAddress],
    ["providerAddress", params.providerAddress],
    ["tokenAddress", params.tokenAddress],
  ] as const) {
    if (!isAddress(value, { strict: false })) {
      throw new StreamingError("INVALID_PARAMS", `${name} is not an address: ${String(value)}`);
    }
  }
  if (params.ratePerSecond <= 0n) {
    throw new StreamingError("INVALID_PARAMS", "ratePerSecond must be positive");
  }
  const duration = params.maxDurationSeconds;
  if (!Number.isSafeInteger(duration) || duration <= 0 || duration > MAX_STREAM_DURATION_SECONDS) {
    throw new StreamingError(
      "INVALID_PARAMS",
      `maxDurationSeconds must be an integer in [1, ${MAX_STREAM_DURATION_SECONDS}]`,
    );
  }
  if (params.maxCap <= 0n) {
    throw new StreamingError("INVALID_PARAMS", "maxCap must be positive");
  }
  const deposit = params.ratePerSecond * BigInt(duration);
  if (deposit > MAX_UINT128) {
    throw new StreamingError(
      "INVALID_PARAMS",
      "ratePerSecond * maxDurationSeconds exceeds uint128",
    );
  }
  if (deposit > params.maxCap) {
    throw new StreamingError(
      "MAX_CAP_EXCEEDED",
      `deposit ${deposit} exceeds maxCap ${params.maxCap}`,
    );
  }
  return { deposit };
}

/**
 * Opens a per-second compute payment stream: checks the network and the parameters, approves
 * exactly the deposit if the allowance is short, opens the stream and waits for it to be mined.
 */
export async function streamComputePayment(
  clients: StreamingClients,
  params: StreamComputePaymentParams,
): Promise<ComputeStream> {
  const { deposit } = planStream(params);
  const account = await connectedAccount(clients, params.chain);
  const contract = getAddress(params.contractAddress);
  const token = getAddress(params.tokenAddress);
  const provider = getAddress(params.providerAddress);
  const { publicClient } = clients;
  const confirmations = params.confirmations ?? 1;

  const paymentToken = await publicClient.readContract({
    address: contract,
    abi: computePaymentAbi,
    functionName: "paymentToken",
  });
  if (!isAddressEqual(paymentToken, token)) {
    throw new StreamingError(
      "TOKEN_MISMATCH",
      `contract ${contract} streams ${paymentToken}, not ${token}`,
    );
  }

  const balance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (balance < deposit) {
    throw new StreamingError(
      "INSUFFICIENT_BALANCE",
      `balance ${balance} is below the deposit ${deposit}`,
    );
  }

  let approvalTxHash: Hash | undefined;
  const allowance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, contract],
  });
  if (allowance < deposit) {
    // Exactly the deposit: the contract is never left with a standing unlimited allowance.
    approvalTxHash = await send(async () => {
      const { request } = await publicClient.simulateContract({
        account,
        chain: params.chain,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [contract, deposit],
      });
      return clients.walletClient.writeContract(request);
    });
    await confirmed(publicClient, approvalTxHash, confirmations);
  }

  const txHash = await send(async () => {
    const { request } = await publicClient.simulateContract({
      account,
      chain: params.chain,
      address: contract,
      abi: computePaymentAbi,
      functionName: "streamCompute",
      args: [provider, params.ratePerSecond, params.maxDurationSeconds],
    });
    return clients.walletClient.writeContract(request);
  });
  const receipt = await confirmed(publicClient, txHash, confirmations);

  const started = parseEventLogs({
    abi: computePaymentAbi,
    eventName: "StreamStarted",
    logs: receipt.logs,
  }).find((log) => isAddressEqual(log.address, contract));
  if (started === undefined) {
    throw new StreamingError("EVENT_MISSING", `no StreamStarted event in ${txHash}`);
  }
  return {
    streamId: started.args.streamId,
    sender: started.args.sender,
    provider: started.args.provider,
    ratePerSecond: started.args.ratePerSecond,
    deposit: started.args.deposit,
    startTime: started.args.startTime,
    endTime: started.args.endTime,
    txHash,
    approvalTxHash,
  };
}

/**
 * Stops a stream and settles it (the sender or the provider at any time, anyone after its end
 * time). Returns what was paid to the provider and refunded to the sender.
 */
export async function stopComputeStream(
  clients: StreamingClients,
  params: StopComputeStreamParams,
): Promise<StreamSettlement> {
  if (params.chain.id === BASE_MAINNET_CHAIN_ID) {
    throw new StreamingError("NETWORK_LOCKED", "Base Mainnet (8453) is locked for ARL streaming");
  }
  if (!isAddress(params.contractAddress, { strict: false })) {
    throw new StreamingError("INVALID_PARAMS", "contractAddress is not an address");
  }
  const account = await connectedAccount(clients, params.chain);
  const contract = getAddress(params.contractAddress);
  const txHash = await send(async () => {
    const { request } = await clients.publicClient.simulateContract({
      account,
      chain: params.chain,
      address: contract,
      abi: computePaymentAbi,
      functionName: "stopStream",
      args: [params.streamId],
    });
    return clients.walletClient.writeContract(request);
  });
  const receipt = await confirmed(clients.publicClient, txHash, params.confirmations ?? 1);
  const settled = parseEventLogs({
    abi: computePaymentAbi,
    eventName: "PaymentSettled",
    logs: receipt.logs,
  }).find((log) => isAddressEqual(log.address, contract));
  if (settled === undefined) {
    throw new StreamingError("EVENT_MISSING", `no PaymentSettled event in ${txHash}`);
  }
  return {
    streamId: settled.args.streamId,
    providerAmount: settled.args.providerAmount,
    refundAmount: settled.args.refundAmount,
    txHash,
  };
}

// ---------------------------------------------------------------- internal

async function connectedAccount(clients: StreamingClients, chain: Chain): Promise<Account> {
  const account = clients.walletClient.account;
  if (account === undefined) {
    throw new StreamingError("NO_ACCOUNT", "walletClient has no account");
  }
  const [publicChainId, walletChainId] = await Promise.all([
    clients.publicClient.getChainId(),
    clients.walletClient.getChainId(),
  ]);
  if (publicChainId !== chain.id || walletChainId !== chain.id) {
    throw new StreamingError(
      "CHAIN_MISMATCH",
      `expected chain ${chain.id}, public client is on ${publicChainId}, wallet on ${walletChainId}`,
    );
  }
  return account;
}

/**
 * Runs a simulate-then-write step. The simulation reverts before anything is signed, and the
 * revert is decoded into a StreamingError carrying the contract's custom error name.
 */
async function send(simulateAndWrite: () => Promise<Hash>): Promise<Hash> {
  try {
    return await simulateAndWrite();
  } catch (error) {
    throw asStreamingError(error);
  }
}

async function confirmed(
  publicClient: PublicClient,
  hash: Hash,
  confirmations: number,
): Promise<TransactionReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations });
  if (receipt.status !== "success") {
    throw new StreamingError("TX_REVERTED", `transaction ${hash} reverted`);
  }
  return receipt;
}

function asStreamingError(error: unknown): unknown {
  if (error instanceof StreamingError || !(error instanceof BaseError)) return error;
  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (reverted instanceof ContractFunctionRevertedError) {
    const name = reverted.data?.errorName;
    return new StreamingError(
      "TX_REVERTED",
      `contract reverted: ${name ?? reverted.shortMessage}`,
      {
        cause: error,
        ...(name === undefined ? {} : { revertName: name }),
      },
    );
  }
  return error;
}
