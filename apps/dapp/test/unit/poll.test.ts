import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { POLL, messageOption, optionMessage, tally } from "../../lib/poll.ts";

describe("demo poll", () => {
  it("maps options to messages and back", () => {
    POLL.options.forEach((_, i) => assert.equal(messageOption(optionMessage(i)), i));
    assert.equal(messageOption(0n), undefined);
    assert.equal(messageOption(99n), undefined);
  });
  it("tallies only this poll's valid options", () => {
    assert.deepEqual(
      tally([
        { scope: 1n, message: 1n },
        { scope: 1n, message: 3n },
        { scope: 1n, message: 1n },
        { scope: 2n, message: 1n },
        { scope: 1n, message: 9n },
      ]),
      [2, 0, 1],
    );
  });
});
