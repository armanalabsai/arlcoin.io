import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validatorKey } from "../src/key.ts";

const HEX = "11".repeat(32);

describe("validatorKey", () => {
  it("accepts the key with or without 0x and ignores surrounding whitespace", () => {
    assert.equal(validatorKey(`0x${HEX}`), `0x${HEX}`);
    assert.equal(validatorKey(HEX), `0x${HEX}`);
    assert.equal(validatorKey(`  0x${HEX}\n`), `0x${HEX}`);
    assert.equal(validatorKey(`${HEX}\r\n`), `0x${HEX}`);
  });

  it("refuses a missing, short or non-hex key without echoing it", () => {
    for (const bad of [undefined, "", "  ", "0x1234", `0x${HEX}00`, `0x${"zz".repeat(32)}`]) {
      assert.throws(
        () => validatorKey(bad),
        (error: Error) => !error.message.includes(HEX),
      );
    }
  });
});
