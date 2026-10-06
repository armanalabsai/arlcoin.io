import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  encodeRegistration,
  parseRegistration,
  safeEndpoint,
  validateService,
} from "../../lib/registry.ts";

const ARL = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const PAY = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const FAC = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";

const input = {
  name: "Llama inference",
  description: "Open-weights chat model, priced per 1,000 tokens.",
  endpoint: "https://ai.example.org/v1",
  terms: {
    network: "eip155:31337",
    asset: ARL,
    unitPrice: "1000000000000000",
    unit: "1,000 tokens",
    payTo: PAY,
    facilitator: FAC,
  },
};

describe("service registration file", () => {
  it("round-trips through an ERC-8004 data URI", () => {
    const service = validateService(input);
    const uri = encodeRegistration(service);
    assert.match(uri, /^data:application\/json;base64,/);
    const parsed = parseRegistration(uri);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.value, service);
    const file = JSON.parse(Buffer.from(uri.split(",")[1]!, "base64").toString()) as Record<
      string,
      unknown
    >;
    assert.equal(file.type, "https://eips.ethereum.org/EIPS/eip-8004#registration-v1");
    assert.equal(file.x402Support, true);
  });

  it("keeps non-ASCII text", () => {
    const s = validateService({ ...input, name: "Görüntü işleme" });
    const parsed = parseRegistration(encodeRegistration(s));
    assert.ok(parsed.ok);
    assert.equal(parsed.value.name, "Görüntü işleme");
  });

  it("rejects bad input", () => {
    const bad = [
      { ...input, name: "" },
      { ...input, name: "x".repeat(81) },
      { ...input, name: "a\u0007b" },
      { ...input, endpoint: "javascript:alert(1)" },
      { ...input, endpoint: "http://example.org" },
      { ...input, endpoint: "https://user:pw@example.org" },
      { ...input, terms: { ...input.terms, unitPrice: "0" } },
      { ...input, terms: { ...input.terms, unitPrice: "-5" } },
      { ...input, terms: { ...input.terms, payTo: "0x123" } },
      { ...input, terms: { ...input.terms, network: "solana:mainnet" } },
    ];
    for (const b of bad) assert.throws(() => validateService(b), JSON.stringify(b).slice(0, 80));
  });

  it("does not treat other agents or other URIs as ARL services", () => {
    const other = Buffer.from(
      JSON.stringify({
        type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        name: "x",
      }),
    ).toString("base64");
    for (const uri of [
      "",
      "https://example.org/agent.json",
      "ipfs://bafy",
      "data:application/json,{}",
      `data:application/json;base64,${other}`,
      "data:application/json;base64,!!!",
      `data:application/json;base64,${"A".repeat(9000)}`,
    ]) {
      assert.equal(parseRegistration(uri).ok, false, uri.slice(0, 40));
    }
  });

  it("drops inactive services", () => {
    const uri = encodeRegistration(validateService(input));
    const file = JSON.parse(Buffer.from(uri.split(",")[1]!, "base64").toString()) as Record<
      string,
      unknown
    >;
    file.active = false;
    assert.equal(
      parseRegistration(
        `data:application/json;base64,${Buffer.from(JSON.stringify(file)).toString("base64")}`,
      ).ok,
      false,
    );
  });

  it("allows http only on this machine", () => {
    assert.equal(safeEndpoint("http://127.0.0.1:8080/x"), "http://127.0.0.1:8080/x");
    assert.throws(() => safeEndpoint("ftp://example.org"));
  });
});
