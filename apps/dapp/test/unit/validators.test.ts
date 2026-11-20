import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { VALIDATORS_URL, parseValidators } from "../../lib/validators.ts";

const WHO = `0x${"12".repeat(20)}`;
const row = {
  token: "ARL",
  validator: WHO,
  stake: "300000000000000000000",
  locked: "100000000000000000000",
  accepted: 1,
  approved: 1,
  rejected: 0,
  slashes: 0,
  since: 1_795_150_000,
};

describe("ARLscan validators", () => {
  it("reads the same-origin API route", () => {
    assert.equal(VALIDATORS_URL, "/api/v1/validators");
  });

  it("keeps well-formed ARL validators and drops the rest", () => {
    const list = parseValidators({
      block: "60100000",
      validators: [
        row,
        { ...row, token: "USDC" },
        { ...row, validator: "0x12" },
        { ...row, stake: "-5" },
        { ...row, approved: 1.5 },
        { ...row, since: "yesterday" },
        null,
      ],
    });
    assert.equal(list.block, "60100000");
    assert.equal(list.rows.length, 2);
    assert.equal(list.rows[0]?.stake, 300n * 10n ** 18n);
    assert.equal(list.rows[0]?.since, 1_795_150_000);
    assert.equal(list.rows[1]?.since, undefined);
  });

  it("refuses an answer that is not a list", () => {
    assert.throws(() => parseValidators({ error: "chain read failed" }), /not a validator list/);
    assert.throws(() => parseValidators(null), /not a validator list/);
  });
});
