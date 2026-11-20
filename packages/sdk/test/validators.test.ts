import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PublicClient } from "viem";

import { VERIFIED_EVALUATORS, getValidators } from "../src/index.ts";

const ARL = VERIFIED_EVALUATORS[0];
const V1 = "0x00000000000000000000000000000000000000A1";
const V2 = "0x00000000000000000000000000000000000000b2";
const CHALLENGER = "0x00000000000000000000000000000000000000C3";
const HEAD = ARL.fromBlock + 10n;

const log = (eventName: string, args: Record<string, unknown>, n: bigint) => ({
  address: ARL.evaluator,
  eventName,
  args,
  blockNumber: ARL.fromBlock + n,
  logIndex: 0,
  transactionHash: `0x${n.toString(16).padStart(64, "0")}`,
});

function fakeClient() {
  const client = {
    getBlock: (a?: { blockNumber?: bigint }) =>
      Promise.resolve({
        number: a?.blockNumber ?? HEAD,
        timestamp: 1_800_000_000n + (a?.blockNumber ?? HEAD) - ARL.fromBlock,
      }),
    getLogs: () =>
      Promise.resolve([
        log("Staked", { validator: V1, amount: 300n }, 1n),
        log("Staked", { validator: V2, amount: 300n }, 2n),
        log("Accepted", { jobId: 1n, validator: V1, bond: 100n }, 3n),
        log("Accepted", { jobId: 1n, validator: V2, bond: 100n }, 3n),
        log("Voted", { jobId: 1n, validator: V1, approve: true }, 4n),
        log("Voted", { jobId: 1n, validator: V2, approve: false }, 4n),
        log("Slashed", { jobId: 1n, account: V2, amount: 100n }, 5n),
        log("Slashed", { jobId: 1n, account: CHALLENGER, amount: 50n }, 5n),
      ]),
    readContract: (a: { functionName: string; args: readonly [string] }) =>
      Promise.resolve(a.functionName === "stakeOf" ? (a.args[0] === V2 ? 200n : 300n) : 0n),
  };
  return client as unknown as PublicClient;
}

describe("validators", () => {
  it("lists who staked and what each did; a challenger's slash is not a validator's", async () => {
    const v = await getValidators(fakeClient());
    assert.equal(v.block, HEAD);
    assert.deepEqual(
      v.validators.map((r) => [
        r.validator.toLowerCase(),
        r.stake,
        r.accepted,
        r.approved,
        r.rejected,
        r.slashes,
        r.slashed,
      ]),
      [
        [V1.toLowerCase(), "300", 1, 1, 0, 0, "0"],
        [V2.toLowerCase(), "200", 1, 0, 1, 1, "100"],
      ],
    );
    const [first] = v.validators;
    assert.ok(first);
    assert.equal(first.since, 1_800_000_001);
    assert.equal(first.token, "ARL");
  });
});
