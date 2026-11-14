import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_ANSWER, modelAnswer, sanitize } from "../src/ai.ts";
import {
  State,
  assistantAnswer,
  handleUpdate,
  questionOf,
  type TelegramApi,
  type TgUpdate,
} from "../src/bot.ts";
import { SupplyReader } from "../src/chain.ts";
import * as kb from "../src/knowledge.ts";
import * as texts from "../src/texts.ts";

const BOT = { id: 999, is_bot: true, first_name: "ARL", username: "ArlProtocolBot" };

class Api implements TelegramApi {
  sent: { chatId: number; text: string }[] = [];
  deleted: number[] = [];
  sendMessage(chatId: number, text: string) {
    this.sent.push({ chatId, text });
    return Promise.resolve();
  }
  deleteMessage(_c: number, id: number) {
    this.deleted.push(id);
    return Promise.resolve(true);
  }
  restrictMember() {
    return Promise.resolve(true);
  }
  leaveChat() {
    return Promise.resolve();
  }
  adminIds() {
    return Promise.resolve([]);
  }
  me() {
    return Promise.resolve(BOT);
  }
}

let n = 1000;
const msg = (
  text: string,
  o: { type?: "private" | "supergroup"; userId?: number; replyToBot?: boolean } = {},
): TgUpdate => ({
  update_id: n,
  message: {
    message_id: n++,
    chat: { id: o.type === "private" ? 7 : -100, type: o.type ?? "supergroup" },
    from: { id: o.userId ?? 7, first_name: "Ada" },
    text,
    ...(o.replyToBot ? { reply_to_message: { from: BOT } } : {}),
  },
});

const noModel = () => new State(null, 10);
const ALL = [
  ...kb.ENTRIES.map((e) => e.answer),
  kb.ROADMAP,
  kb.BUILD_TEXT,
  kb.CONTRACTS_TEXT,
  kb.VERIFIED_TEXT,
  kb.BOUNTY_TEXT,
  kb.LINKS_TEXT,
  texts.ASK_HELP,
  texts.ASK_FALLBACK,
  texts.supply(7_100_000),
  texts.supply(null),
  texts.HELP,
  texts.START,
];

describe("knowledge base", () => {
  it("is English ASCII, within the message limit, with no forbidden claims", () => {
    const banned = [
      /guarantee/i,
      /\b\d+x\b/i,
      /moon(?!\w)/i,
      /partner(ship)? with/i,
      /listed on/i,
      /\baudit/i,
      /\bAPY\b/i,
      /\bAPR\b/i,
      /testnet|sepolia|faucet/i,
    ];
    for (const t of ALL) {
      assert.ok(/^[\n\x20-\x7E]*$/.test(t), t);
      assert.ok(t.length <= 4096);
      for (const b of banned) assert.ok(!b.test(t), `${String(b)}: ${t}`);
    }
  });

  it("names exactly the mainnet contracts in the docs", () => {
    assert.equal(kb.CONTRACTS[0]?.[1], texts.MAINNET_TOKEN);
    for (const [, addr] of kb.CONTRACTS) assert.match(addr, /^0x[0-9a-fA-F]{40}$/);
    assert.equal(new Set(kb.CONTRACTS.map(([, a]) => a)).size, kb.CONTRACTS.length);
  });

  it("matches common questions to the right topic", () => {
    const cases: [string, string][] = [
      ["What is ARL?", "what"],
      ["what's the contract address", "contract"],
      ["where to buy ARL", "buy"],
      ["wen binance listing", "cex"],
      ["how do I stake?", "staking"],
      ["how does a verified job work", "verified"],
      ["is there a python sdk", "build"],
      ["any airdrop?", "airdrop"],
      ["someone DMed me asking for my seed", "security"],
      ["what is the roadmap", "roadmap"],
      ["what's the circulating supply", "supply"],
      ["price prediction?", "price"],
      ["I found a bug", "bounty"],
    ];
    for (const [q, id] of cases) assert.equal(kb.answerFor(q)?.id, id, q);
    assert.equal(kb.answerFor("asdf qwerty"), null);
    assert.equal(kb.answerFor(""), null);
  });

  it("never answers price questions with a price", () => {
    const a = kb.answerFor("what will the price be")?.answer ?? "";
    assert.ok(a.includes("don't discuss price"));
  });
});

describe("model answers", () => {
  it("remove unknown addresses and links, keep known ones, and cap the length", () => {
    const fake = "0x1111111111111111111111111111111111111111";
    const out = sanitize(
      `<think>x</think><answer>Token ${texts.MAINNET_TOKEN}, also ${fake}. See https://evil.example/claim and evil.xyz, or https://arlcoin.io/build/</answer>`,
    );
    assert.ok(out.includes(texts.MAINNET_TOKEN));
    assert.ok(!out.includes(fake));
    assert.ok(!out.includes("evil"));
    assert.ok(out.includes("https://arlcoin.io/build/"));
    assert.ok(!out.includes("<"));
    assert.ok(sanitize(`<answer>${"a".repeat(5000)}</answer>`).length <= MAX_ANSWER);
  });

  it("take the last real tagged answer when reasoning quotes the tags", () => {
    assert.equal(
      sanitize("I should use <answer></answer> tags. <answer>Hello there</answer>"),
      "Hello there",
    );
  });

  it("are off without a key and fall back quietly on errors", async () => {
    assert.equal(await modelAnswer("hi", undefined, undefined), null);
    const failing: typeof fetch = () => Promise.resolve(new Response("no", { status: 500 }));
    assert.equal(await modelAnswer("hi", "k", undefined, failing), null);
    const throwing: typeof fetch = () => Promise.reject(new Error("down"));
    assert.equal(await modelAnswer("hi", "k", undefined, throwing), null);
  });

  it("send the question with the knowledge base and use the answer", async () => {
    let body: { model?: string; messages?: { role: string; content: string }[] } = {};
    const ok: typeof fetch = (_u, init) => {
      body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as typeof body;
      return Promise.resolve(
        Response.json({ choices: [{ message: { content: "<answer>Yes, on Base.</answer>" } }] }),
      );
    };
    assert.equal(await modelAnswer("is it on base?", "k", "m", ok), "Yes, on Base.");
    assert.equal(body.model, "m");
    assert.ok(body.messages?.[0]?.content.includes(texts.MAINNET_TOKEN));
    assert.equal(body.messages?.[1]?.content, "is it on base?");
  });
});

describe("assistant", () => {
  it("answers from the knowledge base, then the model, then the topic list", async () => {
    assert.equal(
      await assistantAnswer("where can I buy", noModel()),
      kb.ENTRIES.find((e) => e.id === "buy")?.answer,
    );
    assert.equal(await assistantAnswer("zzz", noModel()), texts.ASK_FALLBACK);
    assert.equal(await assistantAnswer("  ", noModel()), texts.ASK_HELP);
    const model: typeof fetch = () =>
      Promise.resolve(
        Response.json({ choices: [{ message: { content: "<answer>From the model.</answer>" } }] }),
      );
    const st = new State(null, 10, { apiKey: "k", fetchFn: model });
    assert.equal(await assistantAnswer("zzz", st), "From the model.");
  });

  it("reads the question from /ask and from a mention", () => {
    assert.equal(questionOf("/ask what is ARL", undefined), "what is ARL");
    assert.equal(questionOf("/ask@ArlProtocolBot staking?", "ArlProtocolBot"), "staking?");
    assert.equal(
      questionOf("hey @ArlProtocolBot where to buy", "ArlProtocolBot"),
      "hey  where to buy",
    );
  });

  it("answers every message in a private chat", async () => {
    const api = new Api();
    await handleUpdate(msg("how do I stake?", { type: "private" }), api, noModel());
    assert.equal(api.sent.length, 1);
    assert.ok(api.sent[0]?.text.includes("Staking"));
  });

  it("answers in the group only when addressed, once per user per cooldown", async () => {
    const api = new Api();
    const st = noModel();
    await handleUpdate(msg("where to buy"), api, st);
    assert.equal(api.sent.length, 0, "not addressed: silent");
    await handleUpdate(msg("@ArlProtocolBot where to buy"), api, st);
    assert.equal(api.sent.length, 1);
    await handleUpdate(msg("@ArlProtocolBot and staking?"), api, st);
    assert.equal(api.sent.length, 1, "same user inside the cooldown");
    await handleUpdate(msg("what is ARL", { userId: 8, replyToBot: true }), api, st);
    assert.equal(api.sent.length, 2, "a reply to the bot from another user");
    await handleUpdate(msg("/ask roadmap?", { userId: 9 }), api, st);
    assert.equal(api.sent.length, 3);
    assert.ok(api.sent[2]?.text.includes("roadmap"));
  });

  it("never answers a message that moderation removed", async () => {
    const api = new Api();
    await handleUpdate(
      msg("@ArlProtocolBot claim your free airdrop now, send your seed phrase"),
      api,
      noModel(),
    );
    assert.equal(api.deleted.length, 1);
    assert.ok(!api.sent.some((s) => s.text.includes("airdrop of 500,000")));
  });

  it("serves the new commands", async () => {
    const api = new Api();
    for (const c of ["roadmap", "build", "contracts", "verified", "bounty", "links"])
      await handleUpdate(msg(`/${c}`, { type: "private" }), api, noModel());
    assert.deepEqual(
      api.sent.map((s) => s.text),
      [
        kb.ROADMAP,
        kb.BUILD_TEXT,
        kb.CONTRACTS_TEXT,
        kb.VERIFIED_TEXT,
        kb.BOUNTY_TEXT,
        kb.LINKS_TEXT,
      ],
    );
  });
});

describe("supply", () => {
  it("reads the circulating supply and rejects nonsense", async () => {
    const reader = (body: string, status = 200) =>
      new SupplyReader(() => Promise.resolve(new Response(body, { status })));
    assert.equal(await reader("7099999.999999999931192699").read(), 7_100_000);
    assert.equal(await reader("99999999").read(), null);
    assert.equal(await reader("<html>").read(), null);
    assert.equal(await reader("1", 500).read(), null);
    assert.ok(texts.supply(7_100_000).includes("7,100,000 ARL"));
  });
});
