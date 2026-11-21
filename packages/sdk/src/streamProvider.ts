// The provider side of a compute stream: read a stream, and serve only while it pays.
//
// A client opens a stream to the provider (`streamComputePayment`) and sends its id with every
// request. `serveOnStream` wraps an HTTP handler so that it runs only while that stream is live,
// names this provider, pays at least the asked rate and belongs to the caller:
//
//   export const POST = serveOnStream(
//     { publicClient, chainId: 8453, provider, ratePerSecond },
//     async (req, stream) => new Response(await infer(await req.text())),
//   );
//
// Without an `X-ARL-Stream` header the service answers 402 with its terms. Stream ids are public,
// so the caller proves the stream is its own: it signs a short message with the account that
// opened the stream (`streamAuthHeaders`) and the service checks that signature on every request.
// The provider takes what it has earned with `withdrawComputeStream`, at any time.

import {
  getAddress,
  isAddress,
  isAddressEqual,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";

import { computePaymentAbi } from "./abi.ts";
import { publicClientOf, type ReadClient } from "./client.ts";
import { COMPUTE_PAYMENT, StreamingError } from "./streaming.ts";

/** Request header naming the stream: `<chainId>:<contract>:<streamId>`. */
export const STREAM_HEADER = "X-ARL-Stream";
/** Request header proving the caller opened the stream: `<unix seconds>:<signature>`. */
export const STREAM_SIGNATURE_HEADER = "X-ARL-Stream-Signature";
/** The x402 scheme name of the 402 answer. */
export const STREAM_SCHEME = "arl-stream";

const ZERO = "0x0000000000000000000000000000000000000000";

/** A stream as the contract holds it now, at the block it was read. */
export interface ComputeStreamState {
  streamId: bigint;
  contract: Address;
  sender: Address;
  provider: Address;
  ratePerSecond: bigint;
  startTime: bigint;
  endTime: bigint;
  /** 0 while the stream has not been stopped. */
  stopTime: bigint;
  settled: boolean;
  /** `ratePerSecond × (endTime − startTime)`. */
  deposit: bigint;
  /** Earned by the provider so far, including what it has withdrawn. */
  streamed: bigint;
  /** What the provider can withdraw now. */
  withdrawable: bigint;
  /** The stream is open and still accruing. */
  live: boolean;
  /** Seconds of accrual left; 0 when the stream is not live. */
  secondsLeft: bigint;
  /** The timestamp of the block the stream was read at. */
  readAt: bigint;
}

/** Reads a stream. Throws `StreamingError` (`INVALID_PARAMS`) when no such stream exists. */
export async function getComputeStream(
  c: ReadClient,
  streamId: bigint,
  contractAddress: Address = COMPUTE_PAYMENT,
): Promise<ComputeStreamState> {
  const client = publicClientOf(c);
  const contract = getAddress(contractAddress);
  const block = await client.getBlock();
  const read = { address: contract, abi: computePaymentAbi, blockNumber: block.number } as const;
  const s = await client.readContract({ ...read, functionName: "getStream", args: [streamId] });
  if (isAddressEqual(s.sender, ZERO)) {
    throw new StreamingError("INVALID_PARAMS", `stream ${streamId.toString()} does not exist`);
  }
  const [streamed, withdrawable] = await Promise.all([
    client.readContract({ ...read, functionName: "streamedAmountOf", args: [streamId] }),
    client.readContract({ ...read, functionName: "withdrawableAmountOf", args: [streamId] }),
  ]);
  const startTime = BigInt(s.startTime);
  const endTime = BigInt(s.endTime);
  const stopTime = BigInt(s.stopTime);
  const live = !s.settled && stopTime === 0n && block.timestamp < endTime;
  return {
    streamId,
    contract,
    sender: s.sender,
    provider: s.provider,
    ratePerSecond: s.ratePerSecond,
    startTime,
    endTime,
    stopTime,
    settled: s.settled,
    deposit: s.ratePerSecond * (endTime - startTime),
    streamed,
    withdrawable,
    live,
    secondsLeft: live ? endTime - block.timestamp : 0n,
    readAt: block.timestamp,
  };
}

/** The message a caller signs to prove a stream is its own. */
export function streamAuthMessage(
  chainId: number,
  contract: Address,
  streamId: bigint,
  timestamp: bigint | number,
): string {
  return `ARL compute stream ${String(chainId)}:${getAddress(contract)}:${streamId.toString()} at ${timestamp.toString()}`;
}

/**
 * The two headers a client sends with a request to a service behind `serveOnStream`. The wallet
 * is the account that opened the stream. `now` is Unix seconds (default: this machine's clock).
 */
export async function streamAuthHeaders(
  walletClient: WalletClient,
  stream: { chainId: number; contract?: Address; streamId: bigint },
  now: number = Math.floor(Date.now() / 1000),
): Promise<Record<string, string>> {
  const account = walletClient.account;
  if (account === undefined) throw new StreamingError("NO_ACCOUNT", "walletClient has no account");
  const contract = getAddress(stream.contract ?? COMPUTE_PAYMENT);
  const signature = await walletClient.signMessage({
    account,
    message: streamAuthMessage(stream.chainId, contract, stream.streamId, now),
  });
  return {
    [STREAM_HEADER]: `${String(stream.chainId)}:${contract}:${stream.streamId.toString()}`,
    [STREAM_SIGNATURE_HEADER]: `${String(now)}:${signature}`,
  };
}

export interface ServeOnStreamConfig {
  /** A viem public client, or `{ publicClient }`, on the chain the contract is on. */
  publicClient: ReadClient;
  chainId: number;
  /** The provider the stream must pay: this service's address. */
  provider: Address;
  /** The lowest rate, in token base units per second, the service works for. */
  ratePerSecond: bigint;
  /** The ComputePayment contract (default: the one on Base Mainnet). */
  contract?: Address;
  /** The stream must have at least this many seconds left (default 1). */
  minSecondsLeft?: number;
  /** How old, or how far ahead, a caller's signature may be, in seconds (default 300). */
  maxSignatureAgeSeconds?: number;
}

export type ServeOnStreamHandler = (
  request: Request,
  stream: ComputeStreamState,
) => Response | Promise<Response>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** The 402 answer of a service behind `serveOnStream`: its terms, in x402's shape. */
export function buildStreamOffer(config: ServeOnStreamConfig) {
  if (config.ratePerSecond <= 0n) {
    throw new StreamingError("INVALID_PARAMS", "ratePerSecond must be positive");
  }
  return {
    x402Version: 2,
    accepts: [
      {
        scheme: STREAM_SCHEME,
        network: `eip155:${String(config.chainId)}`,
        payTo: getAddress(config.provider),
        extra: {
          contract: getAddress(config.contract ?? COMPUTE_PAYMENT),
          ratePerSecond: config.ratePerSecond.toString(),
          minSecondsLeft: String(config.minSecondsLeft ?? 1),
        },
      },
    ],
  };
}

/** Wraps `handler` so it runs only while the caller's stream pays this provider. */
export function serveOnStream(
  config: ServeOnStreamConfig,
  handler: ServeOnStreamHandler,
): (request: Request) => Promise<Response> {
  const offer = buildStreamOffer(config);
  const contract = getAddress(config.contract ?? COMPUTE_PAYMENT);
  const provider = getAddress(config.provider);
  const minSecondsLeft = BigInt(config.minSecondsLeft ?? 1);
  const maxAge = BigInt(config.maxSignatureAgeSeconds ?? 300);
  const client = publicClientOf(config.publicClient);
  const refuse = (reason: string) => json(402, { ...offer, error: reason });

  return async (request) => {
    const header = request.headers.get(STREAM_HEADER);
    if (!header) return json(402, offer);

    const parts = header.split(":");
    const [chainPart, contractPart, idPart] = parts;
    if (
      parts.length !== 3 ||
      !chainPart ||
      !contractPart ||
      !idPart ||
      !/^\d+$/.test(chainPart) ||
      !/^\d+$/.test(idPart) ||
      !isAddress(contractPart, { strict: false })
    ) {
      return json(400, { error: `${STREAM_HEADER} must be <chainId>:<contract>:<streamId>` });
    }
    if (Number(chainPart) !== config.chainId || !isAddressEqual(contractPart, contract)) {
      return refuse("the stream is on another chain or contract");
    }
    const streamId = BigInt(idPart);

    const proof = request.headers.get(STREAM_SIGNATURE_HEADER) ?? "";
    const cut = proof.indexOf(":");
    const signedAt = proof.slice(0, cut);
    const signature = proof.slice(cut + 1);
    if (cut < 1 || !/^\d+$/.test(signedAt) || !/^0x[0-9a-fA-F]+$/.test(signature)) {
      return json(400, { error: `${STREAM_SIGNATURE_HEADER} must be <unix seconds>:<signature>` });
    }

    let stream: ComputeStreamState;
    try {
      stream = await getComputeStream(client, streamId, contract);
    } catch (error) {
      if (error instanceof StreamingError) return refuse("no such stream");
      return json(502, { error: "the chain could not be read; ask again" });
    }
    if (!isAddressEqual(stream.provider, provider))
      return refuse("the stream pays another provider");
    if (stream.ratePerSecond < config.ratePerSecond) return refuse("the stream's rate is too low");
    if (!stream.live) return refuse("the stream has ended");
    if (stream.secondsLeft < minSecondsLeft) return refuse("the stream is about to end");

    const at = BigInt(signedAt);
    const age = at > stream.readAt ? at - stream.readAt : stream.readAt - at;
    if (age > maxAge) return refuse("the signature is too old");
    let own: boolean;
    try {
      own = await client.verifyMessage({
        address: stream.sender,
        message: streamAuthMessage(config.chainId, contract, streamId, at),
        signature: signature as Hex,
      });
    } catch {
      own = false;
    }
    if (!own) return refuse("the signature is not the stream sender's");

    return handler(request, stream);
  };
}
