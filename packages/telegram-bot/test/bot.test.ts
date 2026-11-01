import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMMANDS,
  State,
  commandOf,
  handleUpdate,
  type TelegramApi,
  type TgUpdate,
} from "../src/bot.ts";
import type { Status } from "../src/chain.ts";
import * as texts from "../src/texts.ts";
import { handleRequest, parseChatIds, sameSecret, webhookSecret } from "../src/worker.ts";

class FakeApi implements TelegramApi {
  sent: { chatId: number; text: string }[] = [];
  deleted: number[] = [];
  restricted: number[] = [];
  left: number[] = [];
  private readonly admins: number[];
  constructor(admins: number[] = []) {
    this.admins = admins;
  }
  sendMessage(chatId: number, text: string) {
    this.sent.push({ chatId, text });
    return Promise.resolve();
  }
  deleteMessage(_chatId: number, messageId: number) {
    this.deleted.push(messageId);
    return Promise.resolve(true);
  }
  restrictMember(_chatId: number, userId: number) {
    this.restricted.push(userId);
    return Promise.resolve(true);
  }
  leaveChat(chatId: number) {
    this.left.push(chatId);
    return Promise.resolve();
  }
  adminIds() {
    return Promise.resolve(this.admins);
  }
}

let nextId = 1;
function message(
  text: string | undefined,
  opts: {
    userId?: number;
    chatId?: number;
    type?: "private" | "supergroup";
    newMembers?: { id: number; first_name: string }[];
    forward?: boolean;
  } = {},
): TgUpdate {
  return {
    update_id: nextId,
    message: {
      message_id: nextId++,
      chat: { id: opts.chatId ?? -100, type: opts.type ?? "supergroup" },
      from: { id: opts.userId ?? 7, first_name: "Ada" },
      ...(text === undefined ? {} : { text }),
      ...(opts.newMembers ? { new_chat_members: opts.newMembers } : {}),
      ...(opts.forward ? { forward_origin: { type: "user" } } : {}),
    },
  };
}

const state = (allowed: Set<number> | null = null) => new State(allowed, 10);

describe("group moderation", () => {
  it("deletes a scam message with a notice", async () => {
    const api = new FakeApi();
    await handleUpdate(message("DM me for listing"), api, state());
    assert.equal(api.deleted.length, 1);
    assert.deepEqual(
      api.sent.map((s) => s.text),
      [texts.SCAM_NOTICE],
    );
  });

  it("never moderates an admin", async () => {
    const api = new FakeApi([1]);
    await handleUpdate(message("DM me", { userId: 1 }), api, state());
    assert.equal(api.deleted.length, 0);
    assert.equal(api.sent.length, 0);
  });

  it("mutes a flood once", async () => {
    const api = new FakeApi();
    const st = state();
    for (let i = 0; i < 5; i++) await handleUpdate(message("hi"), api, st);
    assert.equal(api.deleted.length, 0);
    await handleUpdate(message("hi"), api, st);
    assert.equal(api.deleted.length, 1);
    assert.deepEqual(api.restricted, [7]);
    assert.equal(api.sent.length, 1);
  });

  it("blocks links from a new member only", async () => {
    const api = new FakeApi();
    const st = state();
    await handleUpdate(message(undefined, { newMembers: [{ id: 7, first_name: "Ada" }] }), api, st);
    assert.ok(api.sent[0]?.text.startsWith("Welcome, Ada."));
    await handleUpdate(message("see https://example.com"), api, st);
    assert.equal(api.deleted.length, 1);
    await handleUpdate(message("see https://example.com", { userId: 8 }), api, st);
    assert.equal(api.deleted.length, 1);
  });

  it("blocks forwards from a new member", async () => {
    const api = new FakeApi();
    const st = state();
    await handleUpdate(message(undefined, { newMembers: [{ id: 7, first_name: "Ada" }] }), api, st);
    await handleUpdate(message("look", { forward: true }), api, st);
    assert.equal(api.deleted.length, 1);
  });

  it("leaves a group that is not on the allow list", async () => {
    const api = new FakeApi();
    await handleUpdate(message("hello", { chatId: -5 }), api, state(new Set([-100])));
    assert.deepEqual(api.left, [-5]);
  });
});

describe("commands", () => {
  it("answers once per cooldown in a group, always in private", async () => {
    const api = new FakeApi();
    const st = state();
    await handleUpdate(message("/help"), api, st);
    await handleUpdate(message("/help"), api, st);
    assert.deepEqual(
      api.sent.map((s) => s.text),
      [texts.HELP],
    );
    const p = new FakeApi();
    await handleUpdate(message("/start", { type: "private", chatId: 7 }), p, st);
    await handleUpdate(message("/start", { type: "private", chatId: 7 }), p, st);
    assert.deepEqual(
      p.sent.map((s) => s.text),
      [texts.START, texts.START],
    );
  });

  it("reads /start@BotName and ignores unknown commands", () => {
    assert.equal(commandOf("/start@ArlProtocolBot"), "start");
    assert.equal(commandOf("/STATUS now"), "status");
    assert.equal(commandOf("/unknown"), null);
    assert.equal(commandOf("hello /start"), null);
  });

  it("reads the chain figures for /status", async () => {
    const api = new FakeApi();
    const st = state();
    st.status = {
      read: (): Promise<Status> =>
        Promise.resolve({
          faucetArl: 200_000,
          faucetAmount: 1_000,
          rewardPeriodFinish: 4_000_000_000,
        }),
    } as never;
    await handleUpdate(message("/status"), api, st);
    assert.ok(api.sent[0]?.text.includes("200,000 testnet ARL left"));
    assert.ok(api.sent[0]?.text.includes("running until"));
  });

  it("says /status is unavailable when both sources fail", async () => {
    const api = new FakeApi();
    const st = state();
    st.status = {
      read: (): Promise<Status> =>
        Promise.resolve({
          faucetArl: null,
          faucetAmount: null,
          rewardPeriodFinish: null,
        }),
    } as never;
    await handleUpdate(message("/status"), api, st);
    assert.deepEqual(
      api.sent.map((s) => s.text),
      [texts.STATUS_UNAVAILABLE],
    );
  });

  it("lists every command in /help", () => {
    for (const name of Object.keys(COMMANDS)) assert.ok(texts.HELP.includes(`/${name}`), name);
  });
});

describe("worker", () => {
  const SECRET = "s".repeat(40);
  const env = { TELEGRAM_BOT_TOKEN: "123456:TEST-TOKEN-NOT-REAL", WEBHOOK_SECRET: SECRET };
  const req = (secret: string | null, body = "{}") =>
    new Request("https://bot.example/telegram", {
      method: "POST",
      headers: secret === null ? {} : { "x-telegram-bot-api-secret-token": secret },
      body,
    });
  const noNetwork: typeof fetch = () => Promise.reject(new Error("no network in tests"));

  it("refuses requests without the webhook secret", async () => {
    assert.equal((await handleRequest(req(null), env, noNetwork)).status, 403);
    assert.equal((await handleRequest(req("x".repeat(40)), env, noNetwork)).status, 403);
  });

  it("refuses to run without a token and ignores a weak secret", async () => {
    assert.equal(
      (await handleRequest(req(SECRET), { WEBHOOK_SECRET: SECRET }, noNetwork)).status,
      503,
    );
    assert.equal(
      (await handleRequest(req("short"), { ...env, WEBHOOK_SECRET: "short" }, noNetwork)).status,
      403,
    );
  });

  it("derives the secret from the token when none is set", async () => {
    const tokenOnly = { TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN };
    const derived = await webhookSecret(tokenOnly);
    assert.match(derived, /^[0-9a-f]{64}$/);
    assert.equal(await webhookSecret(env), SECRET);
    assert.equal(await webhookSecret({}), "");
    assert.equal((await handleRequest(req(derived, "{}"), tokenOnly, noNetwork)).status, 200);
    assert.equal((await handleRequest(req(SECRET), tokenOnly, noNetwork)).status, 403);
  });

  it("points the webhook at its own /telegram path on /setup", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const telegram: typeof fetch = (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return Promise.resolve(Response.json({ ok: true, result: true }));
    };
    const res = await handleRequest(new Request("https://bot.example/setup"), env, telegram);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "webhook set");
    assert.equal(calls.length, 1);
    assert.ok(calls[0]?.url.endsWith("/setWebhook"));
    assert.equal(calls[0]?.body.url, "https://bot.example/telegram");
    assert.equal(calls[0]?.body.secret_token, SECRET);
    const refused: typeof fetch = () => Promise.resolve(Response.json({ ok: false }));
    assert.equal(
      (await handleRequest(new Request("https://bot.example/setup"), env, refused)).status,
      502,
    );
    assert.equal((await handleRequest(new Request("https://bot.example/setup"), {})).status, 503);
  });

  it("accepts an update with the secret and answers 200", async () => {
    const res = await handleRequest(req(SECRET, JSON.stringify(message("hello"))), env, noNetwork);
    assert.equal(res.status, 200);
    assert.equal((await handleRequest(req(SECRET, "not json"), env, noNetwork)).status, 400);
  });

  it("answers only /telegram, /setup and the health check", async () => {
    assert.equal((await handleRequest(new Request("https://bot.example/"), env)).status, 200);
    assert.equal((await handleRequest(new Request("https://bot.example/x"), env)).status, 404);
  });

  it("parses the allow list and compares secrets", () => {
    assert.equal(parseChatIds(""), null);
    assert.deepEqual([...(parseChatIds("-100, -200") ?? [])], [-100, -200]);
    assert.ok(sameSecret("abc", "abc"));
    assert.ok(!sameSecret("abd", "abc"));
    assert.ok(!sameSecret(null, "abc"));
  });
});
