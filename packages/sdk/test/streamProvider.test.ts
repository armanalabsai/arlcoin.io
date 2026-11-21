import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyMessage, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  COMPUTE_PAYMENT,
  STREAM_HEADER,
  STREAM_SIGNATURE_HEADER,
  getComputeStream,
  serveOnStream,
  streamAuthMessage,
} from "../src/index.ts";

// Anvil's public development keys; nothing is sent anywhere.
const sender = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const stranger = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9c86dae88c7a8412cacc3dc8a9b8a7",
);
const PROVIDER: Address = "0x00000000000000000000000000000000000000b2";
const NOW = 1_800_000_000n;
const RATE = 10n ** 15n;

interface Fake {
  sender?: Address;
  provider?: Address;
  rate?: bigint;
  endTime?: bigint;
  stopTime?: bigint;
  settled?: boolean;
}

function fakeClient(f: Fake = {}) {
  const start = NOW - 100n;
  const end = f.endTime ?? NOW + 500n;
  const rate = f.rate ?? RATE;
  return {
    getBlock: () => Promise.resolve({ number: 7n, timestamp: NOW }),
    readContract: ({ functionName }: { functionName: string }) => {
      if (functionName === "getStream")
        return Promise.resolve({
          sender: f.sender ?? sender.address,
          startTime: Number(start),
          endTime: Number(end),
          provider: f.provider ?? PROVIDER,
          stopTime: Number(f.stopTime ?? 0n),
          settled: f.settled ?? false,
          ratePerSecond: rate,
          withdrawn: 0n,
        });
      return Promise.resolve(rate * 100n);
    },
    verifyMessage: (a: { address: Address; message: string; signature: Hex }) => verifyMessage(a),
  } as unknown as PublicClient;
}

async function request(streamId = 1n, signer = sender, at: bigint = NOW, chainId = 8453) {
  const signature = await signer.signMessage({
    message: streamAuthMessage(chainId, COMPUTE_PAYMENT, streamId, at),
  });
  return new Request("https://service.example/infer", {
    method: "POST",
    headers: {
      [STREAM_HEADER]: `${String(chainId)}:${COMPUTE_PAYMENT}:${streamId.toString()}`,
      [STREAM_SIGNATURE_HEADER]: `${at.toString()}:${signature}`,
    },
  });
}

const serve = (f: Fake = {}) =>
  serveOnStream(
    { publicClient: fakeClient(f), chainId: 8453, provider: PROVIDER, ratePerSecond: RATE },
    (_req, stream) => new Response(`served ${stream.secondsLeft.toString()}`),
  );

const reason = async (r: Response) => ((await r.json()) as { error?: string }).error;

describe("serveOnStream", () => {
  it("answers 402 with the terms when no stream is named", async () => {
    const r = await serve()(new Request("https://service.example/infer"));
    assert.equal(r.status, 402);
    const body = (await r.json()) as {
      accepts: { scheme: string; payTo: string; extra: Record<string, string> }[];
    };
    const [offered] = body.accepts;
    assert.ok(offered);
    assert.equal(offered.scheme, "arl-stream");
    assert.equal(offered.payTo.toLowerCase(), PROVIDER.toLowerCase());
    assert.equal(offered.extra.ratePerSecond, RATE.toString());
    assert.equal(offered.extra.contract, COMPUTE_PAYMENT);
  });

  it("serves the sender of a live stream that pays this provider", async () => {
    const r = await serve()(await request());
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "served 500");
  });

  it("refuses someone else's signature: a stream id is public, the sender's key is not", async () => {
    const r = await serve()(await request(1n, stranger));
    assert.equal(r.status, 402);
    assert.equal(await reason(r), "the signature is not the stream sender's");
  });

  it("refuses a signature made for another stream or long ago", async () => {
    const other = await request(2n);
    const reused = new Request("https://service.example/infer", {
      headers: {
        [STREAM_HEADER]: `8453:${COMPUTE_PAYMENT}:1`,
        [STREAM_SIGNATURE_HEADER]: other.headers.get(STREAM_SIGNATURE_HEADER) ?? "",
      },
    });
    assert.equal(await reason(await serve()(reused)), "the signature is not the stream sender's");
    const old = await serve()(await request(1n, sender, NOW - 301n));
    assert.equal(await reason(old), "the signature is too old");
  });

  it("refuses a stream to another provider, at a lower rate, stopped or ended", async () => {
    const cases: [Fake, string][] = [
      [{ provider: stranger.address }, "the stream pays another provider"],
      [{ rate: RATE - 1n }, "the stream's rate is too low"],
      [{ stopTime: NOW - 1n, settled: true }, "the stream has ended"],
      [{ endTime: NOW }, "the stream has ended"],
    ];
    for (const [fake, expected] of cases) {
      const r = await serve(fake)(await request());
      assert.equal(r.status, 402);
      assert.equal(await reason(r), expected);
    }
  });

  it("refuses a stream on another chain and a malformed header", async () => {
    const elsewhere = await serve()(await request(1n, sender, NOW, 84_532));
    assert.equal(await reason(elsewhere), "the stream is on another chain or contract");
    const bad = await serve()(
      new Request("https://service.example/infer", { headers: { [STREAM_HEADER]: "1" } }),
    );
    assert.equal(bad.status, 400);
  });

  it("refuses a stream that does not exist", async () => {
    const r = await serve({ sender: "0x0000000000000000000000000000000000000000" })(
      await request(),
    );
    assert.equal(await reason(r), "no such stream");
  });
});

describe("getComputeStream", () => {
  it("reports the deposit, what is left and whether the stream is live", async () => {
    const s = await getComputeStream(fakeClient(), 1n);
    assert.equal(s.live, true);
    assert.equal(s.secondsLeft, 500n);
    assert.equal(s.deposit, RATE * 600n);
    assert.equal(s.withdrawable, RATE * 100n);
    const ended = await getComputeStream({ publicClient: fakeClient({ endTime: NOW - 1n }) }, 1n);
    assert.equal(ended.live, false);
    assert.equal(ended.secondsLeft, 0n);
  });
});
