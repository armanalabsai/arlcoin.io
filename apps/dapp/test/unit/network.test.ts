import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NetworkLocked,
  NetworkUnsupported,
  TGE_DATE,
  assertAllowedChain,
  localChain,
} from "../../lib/network.ts";

describe("network gate", () => {
  it("allows the local chain and Base Sepolia only", () => {
    assert.doesNotThrow(() => assertAllowedChain(31_337));
    assert.doesNotThrow(() => assertAllowedChain(84_532));
  });
  it("locks Base Mainnet until the TGE, then opens it", () => {
    const tge = Date.parse(TGE_DATE);
    assert.throws(() => assertAllowedChain(8_453, tge - 1), NetworkLocked);
    assert.doesNotThrow(() => assertAllowedChain(8_453, tge));
  });
  it("refuses every other chain", () => {
    for (const id of [1, 10, 137, 42_161, 11_155_111])
      assert.throws(() => assertAllowedChain(id), NetworkUnsupported);
  });
  it("serves the local chain from this machine only", () => {
    assert.equal(
      localChain("http://127.0.0.1:18545").rpcUrls.default.http[0],
      "http://127.0.0.1:18545",
    );
    assert.equal(localChain().id, 31_337);
    assert.throws(() => localChain("https://rpc.example.org"));
  });
});
