import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Address, PublicClient } from "viem";

import { settlementDue } from "../src/index.ts";

const EVALUATOR: Address = "0x5cA6dab18E6b9a5Cd44a4FfFBdf2c5BA3Cd87DfF";

/** A chain at time `now` holding one verdict; `deadline` null = an evaluator without it (v4). */
function chain(now: bigint, phase: number, challengeEnds: bigint, deadline: bigint | null) {
  return {
    getBlock: () => Promise.resolve({ timestamp: now }),
    readContract: (a: { functionName: string }) => {
      if (a.functionName === "getVerdict") return Promise.resolve({ phase, challengeEnds });
      if (deadline === null) return Promise.reject(new Error("no such function"));
      return Promise.resolve(deadline);
    },
  } as unknown as PublicClient;
}

describe("keeper: settlement calls a validator makes when they are due", () => {
  it("finalizes an approved or rejected job only after the challenge window", async () => {
    assert.equal(await settlementDue(chain(99n, 2, 100n, 150n), EVALUATOR, 1n), null);
    assert.equal(await settlementDue(chain(100n, 2, 100n, 150n), EVALUATOR, 1n), "finalize");
    assert.equal(await settlementDue(chain(120n, 3, 100n, 150n), EVALUATOR, 1n), "finalize");
  });

  it("expires a dispute only after the arbiter's deadline, and never on an evaluator without one", async () => {
    assert.equal(await settlementDue(chain(149n, 4, 100n, 150n), EVALUATOR, 1n), null);
    assert.equal(await settlementDue(chain(150n, 4, 100n, 150n), EVALUATOR, 1n), "expireDispute");
    assert.equal(await settlementDue(chain(999n, 4, 100n, null), EVALUATOR, 1n), null);
  });

  it("does nothing for an open or settled job", async () => {
    for (const phase of [0, 1, 5, 6, 7])
      assert.equal(await settlementDue(chain(999n, phase, 100n, 150n), EVALUATOR, 1n), null);
  });
});
