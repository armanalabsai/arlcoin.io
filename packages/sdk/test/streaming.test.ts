import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  type Chain,
  type EIP1193RequestFn,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

import {
  MAX_STREAM_DURATION_SECONDS,
  StreamingError,
  planStream,
  stopComputeStream,
  streamComputePayment,
  type StreamComputePaymentParams,
} from "../src/index.ts";

// Test addresses and a well-known test key (Anvil account 0); nothing here is deployed.
const CONTRACT = "0x1111111111111111111111111111111111111111";
const PROVIDER = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

function params(overrides: Partial<StreamComputePaymentParams> = {}): StreamComputePaymentParams {
  return {
    chain: baseSepolia,
    contractAddress: CONTRACT,
    providerAddress: PROVIDER,
    tokenAddress: TOKEN,
    ratePerSecond: 10n ** 16n,
    maxDurationSeconds: 3600,
    maxCap: 36n * 10n ** 18n,
    ...overrides,
  };
}

/** Clients whose RPC only answers eth_chainId; any other call fails the test. */
function clients(chainId: number, withAccount = true) {
  const request = (({ method }: { method: string }) => {
    if (method === "eth_chainId") return Promise.resolve(`0x${chainId.toString(16)}`);
    return Promise.reject(new Error(`unexpected RPC call ${method}`));
  }) as EIP1193RequestFn;
  const chain: Chain = defineChain({ ...baseSepolia, id: chainId });
  return {
    publicClient: createPublicClient({ chain, transport: custom({ request }) }),
    walletClient: withAccount
      ? createWalletClient({ account, chain, transport: custom({ request }) })
      : createWalletClient({ chain, transport: custom({ request }) }),
  };
}

function rejectsWith(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof StreamingError, String(error));
    assert.equal(error.code, code);
    return true;
  };
}

describe("planStream", () => {
  it("returns rate * duration as the deposit", () => {
    assert.deepEqual(planStream(params()), { deposit: 36n * 10n ** 18n });
  });

  it("accepts a deposit equal to maxCap and refuses one above it", () => {
    assert.doesNotThrow(() => planStream(params({ maxCap: 36n * 10n ** 18n })));
    assert.throws(() => planStream(params({ maxCap: 36n * 10n ** 18n - 1n })), {
      name: "StreamingError",
      code: "MAX_CAP_EXCEEDED",
    });
  });

  it("refuses Base Mainnet unconditionally", () => {
    assert.throws(() => planStream(params({ chain: base })), { code: "NETWORK_LOCKED" });
  });

  it("refuses invalid parameters", () => {
    const invalid: Partial<StreamComputePaymentParams>[] = [
      { ratePerSecond: 0n },
      { ratePerSecond: -1n },
      { maxDurationSeconds: 0 },
      { maxDurationSeconds: 1.5 },
      { maxDurationSeconds: MAX_STREAM_DURATION_SECONDS + 1 },
      { maxCap: 0n },
      { providerAddress: "0x1234" },
      { tokenAddress: "not-an-address" as `0x${string}` },
      { contractAddress: "0x" },
      { ratePerSecond: 2n ** 128n, maxDurationSeconds: 1, maxCap: 2n ** 200n },
    ];
    for (const o of invalid) {
      assert.throws(
        () => planStream(params(o)),
        { code: "INVALID_PARAMS" },
        JSON.stringify(o, (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v)),
      );
    }
  });

  it("accepts the maximum duration", () => {
    assert.doesNotThrow(() =>
      planStream(params({ maxDurationSeconds: MAX_STREAM_DURATION_SECONDS, maxCap: 2n ** 128n })),
    );
  });
});

describe("streamComputePayment", () => {
  it("refuses when the RPC is on another chain, before reading anything", async () => {
    await assert.rejects(streamComputePayment(clients(1), params()), rejectsWith("CHAIN_MISMATCH"));
  });

  it("refuses a wallet without an account", async () => {
    await assert.rejects(
      streamComputePayment(clients(baseSepolia.id, false), params()),
      rejectsWith("NO_ACCOUNT"),
    );
  });

  it("refuses an over-cap stream before any RPC call", async () => {
    await assert.rejects(
      streamComputePayment(clients(baseSepolia.id), params({ maxCap: 1n })),
      rejectsWith("MAX_CAP_EXCEEDED"),
    );
  });
});

describe("stopComputeStream", () => {
  it("refuses Base Mainnet and a bad contract address", async () => {
    const c = clients(baseSepolia.id);
    await assert.rejects(
      stopComputeStream(c, { chain: base, contractAddress: CONTRACT, streamId: 1n }),
      rejectsWith("NETWORK_LOCKED"),
    );
    await assert.rejects(
      stopComputeStream(c, { chain: baseSepolia, contractAddress: "0x12", streamId: 1n }),
      rejectsWith("INVALID_PARAMS"),
    );
  });
});
