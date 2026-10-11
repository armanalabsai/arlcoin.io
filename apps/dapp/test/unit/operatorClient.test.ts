import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { operatorBase } from "../../lib/operatorClient.ts";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("operator API location", () => {
  it("is this app unless NEXT_PUBLIC_ARL_OPERATOR_URL names an https origin", () => {
    delete process.env.NEXT_PUBLIC_ARL_OPERATOR_URL;
    process.env.NEXT_PUBLIC_BASE_PATH = "/app";
    assert.equal(operatorBase(), "/app");
    process.env.NEXT_PUBLIC_ARL_OPERATOR_URL = "https://app.arlcoin.io/ignored/path";
    assert.equal(operatorBase(), "https://app.arlcoin.io");
    process.env.NEXT_PUBLIC_ARL_OPERATOR_URL = "http://127.0.0.1:3219";
    assert.equal(operatorBase(), "http://127.0.0.1:3219");
    process.env.NEXT_PUBLIC_ARL_OPERATOR_URL = "http://app.arlcoin.io";
    assert.throws(() => operatorBase());
  });
});
