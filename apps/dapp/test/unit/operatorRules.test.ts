import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SNARK_FIELD } from "@arl/zk";

import {
  FAUCET_AMOUNT,
  OperatorRequestError,
  faucetDecision,
  joinMessage,
  parseFaucet,
  parseJoin,
  parseRelay,
  parseSettle,
} from "../../lib/operatorRules.ts";
import { POLL } from "../../lib/poll.ts";

const A = "0x3b33Db294B9f52993728103215be1D86A7777093";
const ARL = "0x244312b619127B6458154F3467eFD7c87CD28500";
const SIG = `0x${"ab".repeat(65)}`;
const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof OperatorRequestError);
    return e.status;
  }
  assert.fail("expected a rejection");
};

describe("faucet", () => {
  it("accepts an account and refuses anything else", () => {
    assert.equal(parseFaucet({ account: A.toLowerCase() }).account, A);
    for (const body of [null, [], {}, { account: "0x12" }, { account: `0x${"0".repeat(40)}` }])
      assert.equal(
        status(() => parseFaucet(body)),
        400,
      );
  });
  it("pays only accounts below the amount, once a day, while it has funds", () => {
    const ok = { balance: 0n, paidRecently: false, operatorBalance: FAUCET_AMOUNT };
    assert.deepEqual(faucetDecision(ok), { ok: true });
    assert.equal(faucetDecision({ ...ok, balance: FAUCET_AMOUNT }).ok, false);
    assert.equal(faucetDecision({ ...ok, paidRecently: true }).ok, false);
    assert.equal(faucetDecision({ ...ok, operatorBalance: FAUCET_AMOUNT - 1n }).ok, false);
  });
});

describe("join", () => {
  it("binds the request to the commitment and the chain", () => {
    assert.match(joinMessage(5n, 84_532), /commitment 5 .*chain 84532/);
    const r = parseJoin({ account: A, commitment: "123", signature: SIG });
    assert.equal(r.commitment, 123n);
    assert.equal(r.account, A);
  });
  it("refuses commitments outside the field and bad signatures", () => {
    for (const commitment of ["0", SNARK_FIELD.toString(), "-1", "1e3", 5])
      assert.equal(
        status(() => parseJoin({ account: A, commitment, signature: SIG })),
        400,
      );
    for (const signature of ["0x", "abc", `0x${"z".repeat(130)}`])
      assert.equal(
        status(() => parseJoin({ account: A, commitment: "1", signature })),
        400,
      );
  });
});

describe("relay", () => {
  const vote = {
    scope: POLL.scope.toString(),
    message: "1",
    root: "7",
    nullifier: "9",
    proof: `0x${"00".repeat(64)}`,
  };
  it("accepts a vote in the demo poll", () => {
    const r = parseRelay(vote);
    assert.equal(r.message, 1n);
    assert.equal(r.scope, POLL.scope);
  });
  it("refuses other scopes, options outside the poll and malformed proofs", () => {
    assert.equal(
      status(() => parseRelay({ ...vote, scope: "2" })),
      400,
    );
    assert.equal(
      status(() => parseRelay({ ...vote, message: "0" })),
      400,
    );
    assert.equal(
      status(() => parseRelay({ ...vote, message: String(POLL.options.length + 1) })),
      400,
    );
    assert.equal(
      status(() => parseRelay({ ...vote, nullifier: "0" })),
      400,
    );
    assert.equal(
      status(() => parseRelay({ ...vote, proof: "0x12" })),
      400,
    );
    assert.equal(
      status(() => parseRelay({ ...vote, proof: `0x${"0".repeat(40_000)}` })),
      400,
    );
  });
});

describe("settle", () => {
  const expect = { payTo: A, asset: ARL, network: "eip155:84532" } as const;
  const body = {
    payload: { x402Version: 2, accepted: {}, payload: {} },
    requirements: { scheme: "upto", network: "eip155:84532", payTo: A, asset: ARL, amount: "1000" },
    amount: "250",
  };
  it("keeps the signed ceiling in the requirements and the metered charge apart", () => {
    const r = parseSettle(body, expect);
    assert.equal(r.amount, 250n);
    assert.equal(r.requirements.amount, "1000");
  });
  it("settles only for the operator, in ARL, on this network, up to the ceiling", () => {
    const req = body.requirements;
    assert.equal(
      status(() => parseSettle({ ...body, requirements: { ...req, payTo: ARL } }, expect)),
      403,
    );
    assert.equal(
      status(() => parseSettle({ ...body, requirements: { ...req, asset: A } }, expect)),
      400,
    );
    assert.equal(
      status(() =>
        parseSettle({ ...body, requirements: { ...req, network: "eip155:8453" } }, expect),
      ),
      400,
    );
    assert.equal(
      status(() => parseSettle({ ...body, requirements: { ...req, scheme: "exact" } }, expect)),
      400,
    );
    assert.equal(
      status(() => parseSettle({ ...body, amount: "1001" }, expect)),
      400,
    );
    assert.equal(
      status(() => parseSettle({ ...body, payload: { ...body.payload, x402Version: 1 } }, expect)),
      400,
    );
  });
});
