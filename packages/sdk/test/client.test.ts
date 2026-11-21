import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PublicClient } from "viem";

import { ESCROWS, VERIFIED_EVALUATORS, getJob, publicClientOf } from "../src/index.ts";
import { entryOf } from "../src/client.ts";

describe("one client shape for every read", () => {
  const client = { marker: 1 } as unknown as PublicClient;

  it("takes a public client or { publicClient }", () => {
    assert.equal(publicClientOf(client), client);
    assert.equal(publicClientOf({ publicClient: client }), client);
  });

  it("names a deployment by token, escrow or evaluator", () => {
    const addresses = (e: (typeof VERIFIED_EVALUATORS)[number]) => [e.escrow, e.evaluator];
    const [arl, usdc] = VERIFIED_EVALUATORS;
    assert.equal(entryOf(VERIFIED_EVALUATORS, addresses, "ARL"), arl);
    assert.equal(entryOf(VERIFIED_EVALUATORS, addresses, "usdc"), usdc);
    assert.equal(entryOf(VERIFIED_EVALUATORS, addresses, arl.escrow.toLowerCase()), arl);
    assert.equal(entryOf(VERIFIED_EVALUATORS, addresses, usdc.evaluator), usdc);
    assert.equal(entryOf(VERIFIED_EVALUATORS, addresses, "DAI"), undefined);
  });

  it("getJob reads the same job by token and by escrow address, with either client shape", async () => {
    const asked: string[] = [];
    const fake = {
      readContract: ({ address, functionName }: { address: string; functionName: string }) => {
        asked.push(`${address}:${functionName}`);
        if (functionName === "getJob")
          return Promise.resolve({
            id: 1n,
            client: "0x00000000000000000000000000000000000000A1",
            provider: "0x00000000000000000000000000000000000000b2",
            evaluator: VERIFIED_EVALUATORS[0].evaluator,
            description: "spec",
            budget: 100n * 10n ** 18n,
            expiredAt: 1_800_000_000n,
            status: 1,
            hook: "0x0000000000000000000000000000000000000000",
          });
        if (functionName === "paymentToken")
          return Promise.resolve("0x00000000000000000000000000000000000000C3");
        return Promise.resolve(18);
      },
    } as unknown as PublicClient;

    const byToken = await getJob(fake, "ARL", 1n);
    const byAddress = await getJob({ publicClient: fake }, ESCROWS.ARL, 1n);
    assert.deepEqual(byToken, byAddress);
    assert.equal(byToken.budget, "100");
    assert.equal(byToken.status, "Funded");
    assert.ok(
      asked.every(
        (a) =>
          a.startsWith(ESCROWS.ARL) || a.startsWith("0x00000000000000000000000000000000000000C3"),
      ),
    );
  });
});
