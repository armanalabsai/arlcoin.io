import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NetworkLocked,
  NetworkUnsupported,
  TGE_DATE,
  appChain,
  assertAllowedChain,
  baseMainnetChain,
  localChain,
} from "../../lib/network.ts";

describe("network gate", () => {
  it("allows the local chain", () => {
    assert.doesNotThrow(() => assertAllowedChain(31_337));
  });
  it("locks Base Mainnet until the TGE, then opens it", () => {
    const tge = Date.parse(TGE_DATE);
    assert.throws(() => assertAllowedChain(8_453, tge - 1), NetworkLocked);
    assert.doesNotThrow(() => assertAllowedChain(8_453, tge));
  });
  it("refuses every other chain", () => {
    for (const id of [1, 10, 137, 42_161, 84_532, 11_155_111])
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
  it("builds the app for the local chain or Base Mainnet only", () => {
    assert.equal(appChain(undefined, undefined).id, 31_337);
    assert.equal(
      appChain("31337", "http://127.0.0.1:18545").rpcUrls.default.http[0],
      "http://127.0.0.1:18545",
    );
    const mainnet = appChain("8453", undefined);
    assert.equal(mainnet.id, 8_453);
    assert.ok(mainnet.rpcUrls.default.http.length >= 2);
    assert.equal(
      baseMainnetChain("https://rpc.example.org").rpcUrls.default.http[0],
      "https://rpc.example.org",
    );
    assert.throws(() => baseMainnetChain("http://rpc.example.org"));
    assert.deepEqual(baseMainnetChain("http://127.0.0.1:18760").rpcUrls.default.http, [
      "http://127.0.0.1:18760",
    ]);
    assert.throws(() => appChain("84532", undefined), NetworkUnsupported);
    assert.throws(() => appChain("1", undefined), NetworkUnsupported);
  });
});
