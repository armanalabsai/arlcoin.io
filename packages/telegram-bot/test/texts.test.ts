import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseOperator, parseUint } from "../src/chain.ts";
import * as texts from "../src/texts.ts";

const ALL = [
  texts.START,
  texts.HELP,
  texts.RULES,
  texts.SCAM_WARNING,
  texts.welcome("Ada"),
  texts.SCAM_NOTICE,
  texts.APP_TEXT,
  texts.FAUCET_TEXT,
  texts.WHITELIST_TEXT,
  texts.LAUNCH,
  texts.status(200_000, 1_000, 1_800_000_000, 1_790_000_000),
];

describe("texts", () => {
  it("are English ASCII only", () => {
    // Printable ASCII and newlines: rules out Turkish letters such as the dotted capital I.
    for (const t of ALL) assert.ok(/^[\n\x20-\x7E]*$/.test(t), t);
  });

  it("make no forbidden claims", () => {
    const banned = [
      /guarantee(?!d profit)/i,
      /\b\d+x\b/i,
      /moon/i,
      /partner(ship)? with/i,
      /listed on/i,
      /\baudit/i,
      /free (ARL|tokens?)/i,
      /\bAPY\b/i,
      /\bAPR\b/i,
    ];
    for (const t of ALL) for (const b of banned) assert.ok(!b.test(t), `${String(b)}: ${t}`);
  });

  it("state the status honestly", () => {
    assert.ok(texts.START.includes(texts.MAINNET_TOKEN));
    assert.ok(texts.SCAM_WARNING.includes(texts.MAINNET_TOKEN));
    assert.ok(texts.START.includes("No airdrop at launch"));
    assert.ok(texts.HELP.includes("x.com/arlprotocol"));
    assert.ok(texts.START.includes(texts.APP) && texts.START.includes("no value"));
    assert.ok(texts.SCAM_WARNING.includes("seed phrase"));
    assert.ok(texts.START.includes("t.me/arlprotocol_community"));
  });

  it("bound the welcome name", () => {
    assert.ok(texts.welcome("x".repeat(1000)).length < texts.welcome("").length + 70);
    assert.ok(texts.welcome("").includes("there"));
  });

  it("fit the Telegram message limit", () => {
    for (const t of ALL) assert.ok(t.length <= 4096);
  });

  it("render the status", () => {
    const now = 1_800_000_000;
    assert.ok(texts.status(0, 1_000, now + 10, now).includes("empty"));
    assert.ok(texts.status(5_000, 1_000, now - 1, now).includes("not running"));
    assert.ok(texts.status(null, null, null, now).includes("unknown"));
    assert.ok(texts.status(200_000, 1_000, now + 10, now).includes("200,000 testnet ARL left"));
  });

  it("name the mainnet contract in /launch", () => {
    assert.ok(texts.LAUNCH.includes("live on Base Mainnet"));
    assert.ok(texts.LAUNCH.includes(texts.MAINNET_TOKEN));
    assert.ok(texts.LAUNCH.includes(texts.BUY));
  });
});

describe("chain parsing", () => {
  it("reads the operator status", () => {
    const body = { arl: String(200_000n * 10n ** 18n), faucetAmount: String(1_000n * 10n ** 18n) };
    assert.deepEqual(parseOperator(body), [200_000, 1_000]);
    assert.deepEqual(parseOperator({}), [null, null]);
    assert.deepEqual(parseOperator({ arl: "x", faucetAmount: "1" }), [null, null]);
  });

  it("reads a uint from eth_call", () => {
    assert.equal(parseUint(`0x${"0".repeat(56)}6afa1f88`), 0x6afa1f88);
    assert.equal(parseUint("0x"), null);
    assert.equal(parseUint(null), null);
  });
});
