import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PublicClient } from "viem";

import { getAgentPassport } from "../src/index.ts";

const OWNER = "0x00000000000000000000000000000000000000A1";
const dataUri = (file: unknown) =>
  `data:application/json;base64,${Buffer.from(JSON.stringify(file)).toString("base64")}`;

function fakeClient(uri: string | null) {
  const client = {
    getBlock: () => Promise.resolve({ number: 60_000_000n, timestamp: 1_800_000_000n }),
    getLogs: () => Promise.resolve([]),
    readContract: (a: { functionName: string }) => {
      if (uri === null)
        return Promise.reject(new Error("execution reverted: ERC721NonexistentToken"));
      return Promise.resolve(a.functionName === "ownerOf" ? OWNER : uri);
    },
  };
  return client as unknown as PublicClient;
}

describe("agent passport", () => {
  it("reads the identity an owner states, as bounded plain text", async () => {
    const p = await getAgentPassport(
      fakeClient(dataUri({ name: "  Summary\u0007Bot ", description: "x".repeat(900) })),
      7n,
    );
    assert.equal(p.registered, true);
    assert.equal(p.owner?.toLowerCase(), OWNER.toLowerCase());
    assert.equal(p.name, "Summary Bot");
    assert.equal(p.description?.length, 500);
    assert.equal(p.block, 60_000_000n);
    assert.equal(p.score.score_bps, null);
    assert.deepEqual(p.outcomes, []);
    assert.equal(p.firstOutcomeAt, undefined);
  });

  it("names where an off-chain registration file is, and survives a broken one", async () => {
    const off = await getAgentPassport(fakeClient("ipfs://bafy-example/agent.json"), 7n);
    assert.equal(off.registrationUri, "ipfs://bafy-example/agent.json");
    assert.equal(off.name, undefined);
    const broken = await getAgentPassport(fakeClient("data:application/json;base64,@@@"), 7n);
    assert.equal(broken.registered, true);
    assert.equal(broken.name, undefined);
  });

  it("says so when the agent is not registered", async () => {
    const p = await getAgentPassport(fakeClient(null), 7n);
    assert.equal(p.registered, false);
    assert.equal(p.owner, undefined);
  });
});
