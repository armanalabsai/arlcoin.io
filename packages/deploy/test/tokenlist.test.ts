import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TOKEN_LOGO, TokenListError, buildTokenList } from "../src/tokenlist.ts";

describe("token list", () => {
  it("lists ARL with checksummed address, 18 decimals and the logo", () => {
    const list = buildTokenList(
      { 8453: "0x0e8a5434f12d3d839a0a7e88d3a66b11bd712b97" },
      new Date("2026-11-01T00:00:00Z"),
    );
    assert.equal(list.timestamp, "2026-11-01T00:00:00.000Z");
    assert.deepEqual(list.tokens, [
      {
        chainId: 8453,
        address: "0x0e8A5434f12D3d839a0a7E88d3a66b11bd712b97",
        name: "ARL",
        symbol: "ARL",
        decimals: 18,
        logoURI: TOKEN_LOGO,
      },
    ]);
  });

  it("refuses other chains, bad addresses and an empty list", () => {
    const at = new Date(0);
    assert.throws(
      () => buildTokenList({ 1: "0x0e8A5434f12D3d839a0a7E88d3a66b11bd712b97" }, at),
      TokenListError,
    );
    assert.throws(() => buildTokenList({ 8453: "0x1234" }, at), TokenListError);
    assert.throws(
      () => buildTokenList({ 8453: "0x0000000000000000000000000000000000000000" }, at),
      TokenListError,
    );
    assert.throws(() => buildTokenList({}, at), TokenListError);
  });
});
