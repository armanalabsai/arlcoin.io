// ARL community bot: commands, welcome messages and spam protection, on Telegram webhook
// updates. Kept free of the hosting runtime: the Worker (worker.ts) passes each update in.

import { modelAnswer } from "./ai.ts";
import { StatusReader, SupplyReader } from "./chain.ts";
import * as kb from "./knowledge.ts";
import { Cooldown, FloodLimiter, NewMembers, decide } from "./spam.ts";
import * as texts from "./texts.ts";

/** The parts of a Telegram update the bot reads (Bot API types, trimmed). */
export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
}
export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}
export interface TgEntity {
  type: string;
}
export interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  sender_chat?: { id: number };
  text?: string;
  caption?: string;
  entities?: TgEntity[];
  reply_to_message?: { from?: TgUser };
  caption_entities?: TgEntity[];
  forward_origin?: unknown;
  new_chat_members?: TgUser[];
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
}

/** The Bot API calls the bot makes. */
export interface TelegramApi {
  sendMessage(chatId: number, text: string, replyTo?: number): Promise<void>;
  deleteMessage(chatId: number, messageId: number): Promise<boolean>;
  restrictMember(chatId: number, userId: number, untilUnix: number): Promise<boolean>;
  leaveChat(chatId: number): Promise<void>;
  adminIds(chatId: number): Promise<number[]>;
  /** The bot's own account (getMe); used to see when a group message is addressed to it. */
  me?(): Promise<TgUser>;
}

/** Optional model answers (ai.ts); off unless the Worker has an NVIDIA_API_KEY secret. */
export interface ModelConfig {
  apiKey?: string | undefined;
  model?: string | undefined;
  fetchFn?: typeof fetch | undefined;
}

const ADMIN_CACHE_MS = 600_000;

export class State {
  readonly flood = new FloodLimiter();
  readonly members = new NewMembers();
  readonly cooldown = new Cooldown();
  readonly admins = new Map<number, { at: number; ids: Set<number> }>();
  /** One assistant answer per user per 20 seconds in groups, against spam and model cost. */
  readonly askCooldown = new Cooldown(20);
  status = new StatusReader();
  supply = new SupplyReader();
  self: TgUser | null = null;
  readonly allowedChats: Set<number> | null;
  readonly muteMinutes: number;
  readonly model: ModelConfig;
  constructor(allowedChats: Set<number> | null, muteMinutes: number, model: ModelConfig = {}) {
    this.allowedChats = allowedChats;
    this.muteMinutes = muteMinutes;
    this.model = model;
  }
}

export const COMMANDS: Record<string, () => string | Promise<string>> = {
  start: () => texts.START,
  help: () => texts.HELP,
  rules: () => texts.RULES,
  app: () => texts.APP_TEXT,
  launch: () => texts.LAUNCH,
  whitelist: () => texts.WHITELIST_TEXT,
  status: () => "",
  supply: () => "",
  ask: () => "",
  roadmap: () => kb.ROADMAP,
  build: () => kb.BUILD_TEXT,
  contracts: () => kb.CONTRACTS_TEXT,
  verified: () => kb.VERIFIED_TEXT,
  bounty: () => kb.BOUNTY_TEXT,
  links: () => kb.LINKS_TEXT,
};

/** The menu Telegram shows for the bot (setMyCommands); every entry is a command above. */
export const COMMAND_MENU: readonly { command: string; description: string }[] = [
  { command: "ask", description: "Ask the ARL assistant a question" },
  { command: "start", description: "What ARL is and where things stand" },
  { command: "roadmap", description: "Where we are and what comes next" },
  { command: "build", description: "Build on ARL: n8n, TypeScript, Python" },
  { command: "contracts", description: "ARL contracts on Base Mainnet" },
  { command: "verified", description: "How a verified job works" },
  { command: "status", description: "Staking status, live" },
  { command: "supply", description: "Circulating supply, live" },
  { command: "app", description: "Open the ARL app" },
  { command: "launch", description: "The token contract and where to buy" },
  { command: "bounty", description: "The bug bounty" },
  { command: "links", description: "Official links" },
  { command: "rules", description: "Group rules and safety" },
  { command: "whitelist", description: "Whitelist registration" },
  { command: "help", description: "All commands" },
];

/** "/status@ArlBot args" → "status"; anything else → null. */
export function commandOf(text: string | undefined): string | null {
  const m = /^\/([a-z_]+)(@\w+)?(\s|$)/i.exec(text ?? "");
  const name = m?.[1]?.toLowerCase();
  return name && name in COMMANDS ? name : null;
}

async function adminIds(api: TelegramApi, st: State, chatId: number): Promise<Set<number>> {
  const cached = st.admins.get(chatId);
  if (cached && Date.now() - cached.at < ADMIN_CACHE_MS) return cached.ids;
  let ids: Set<number>;
  try {
    ids = new Set(await api.adminIds(chatId));
  } catch {
    ids = cached?.ids ?? new Set();
  }
  st.admins.set(chatId, { at: Date.now(), ids });
  return ids;
}

async function statusText(st: State): Promise<string> {
  const s = await st.status.read();
  if (s.totalStaked === null && s.rewardPeriodFinish === null) return texts.STATUS_UNAVAILABLE;
  return texts.status(s.totalStaked, s.rewardPeriodFinish, Math.floor(Date.now() / 1000));
}

async function supplyText(st: State): Promise<string> {
  const circulating = await st.supply.read();
  return texts.supply(circulating);
}

/**
 * The assistant's answer to a free-text question: the knowledge base first, then a grounded
 * model answer when one is configured, then the list of topics.
 */
export async function assistantAnswer(question: string, st: State): Promise<string> {
  const q = question.trim();
  if (q === "") return texts.ASK_HELP;
  const entry = kb.answerFor(q);
  if (entry) return entry.answer;
  const ai = await modelAnswer(q, st.model.apiKey, st.model.model, st.model.fetchFn);
  return ai ?? texts.ASK_FALLBACK;
}

/** The question in "/ask question", or in a message that mentions the bot. */
export function questionOf(text: string, username: string | undefined): string {
  let q = text.replace(/^\/ask(@\w+)?/i, "");
  if (username) q = q.replace(new RegExp(`@${username}\\b`, "gi"), "");
  return q.trim();
}

async function selfOf(api: TelegramApi, st: State): Promise<TgUser | null> {
  if (st.self || !api.me) return st.self;
  try {
    st.self = await api.me();
  } catch {
    return null;
  }
  return st.self;
}

/** Whether a group message speaks to the bot: a reply to it, or an @mention of it. */
function addressedToBot(msg: TgMessage, self: TgUser | null): boolean {
  if (!self) return false;
  if (msg.reply_to_message?.from?.id === self.id) return true;
  const text = (msg.text ?? "").toLowerCase();
  return !!self.username && text.includes(`@${self.username.toLowerCase()}`);
}

/** Handles one update. Errors from Telegram are swallowed: a webhook must always answer 200. */
export async function handleUpdate(update: TgUpdate, api: TelegramApi, st: State): Promise<void> {
  const msg = update.message ?? update.edited_message;
  if (!msg) return;
  const chat = msg.chat;
  const isGroup = chat.type === "group" || chat.type === "supergroup";

  // Groups not on the allow list are left.
  if (isGroup && st.allowedChats && !st.allowedChats.has(chat.id)) {
    await api.leaveChat(chat.id).catch(() => undefined);
    return;
  }

  const command = update.message ? commandOf(msg.text) : null;
  if (command) {
    const userKey = `ask:${String(msg.from?.id ?? 0)}`;
    if (isGroup && command === "ask" && !st.askCooldown.ready(chat.id, userKey)) return;
    if (isGroup && command !== "ask" && !st.cooldown.ready(chat.id, command)) return;
    const reply = COMMANDS[command];
    if (!reply) return;
    let text: string;
    if (command === "status") text = await statusText(st);
    else if (command === "supply") text = await supplyText(st);
    else if (command === "ask") {
      const self = await selfOf(api, st);
      text = await assistantAnswer(questionOf(msg.text ?? "", self?.username), st);
    } else text = await reply();
    await api.sendMessage(chat.id, text, msg.message_id).catch(() => undefined);
    return;
  }
  if (!isGroup) {
    // A private chat is a conversation with the assistant.
    if (update.message && chat.type === "private" && msg.text && !msg.text.startsWith("/"))
      await api
        .sendMessage(chat.id, await assistantAnswer(msg.text, st), msg.message_id)
        .catch(() => undefined);
    return;
  }

  if (msg.new_chat_members?.length) {
    for (const user of msg.new_chat_members) {
      if (user.is_bot) continue;
      st.members.joined(chat.id, user.id);
      if (st.cooldown.ready(chat.id, "welcome"))
        await api
          .sendMessage(chat.id, texts.welcome(user.first_name), msg.message_id)
          .catch(() => undefined);
    }
    return;
  }

  const user = msg.from;
  if (!user) return;
  if (msg.sender_chat && msg.sender_chat.id === chat.id) return; // anonymous admin
  const isAdmin = (await adminIds(api, st, chat.id)).has(user.id);
  const entities = [...(msg.entities ?? []), ...(msg.caption_entities ?? [])];
  const action = decide({
    text: msg.text ?? msg.caption,
    isAdmin,
    isForward: msg.forward_origin !== undefined,
    hasLinkEntity: entities.some((e) => e.type === "url" || e.type === "text_link"),
    onProbation: st.members.onProbation(chat.id, user.id),
    flooding: isAdmin ? false : st.flood.hit(chat.id, user.id),
  });
  if (action === null) {
    // Answer questions addressed to the bot (a reply to it or an @mention), once per user per
    // cooldown, after moderation has let the message through.
    if (!update.message || !msg.text) return;
    const self = await selfOf(api, st);
    if (!addressedToBot(msg, self)) return;
    if (!st.askCooldown.ready(chat.id, `ask:${String(user.id)}`)) return;
    const answer = await assistantAnswer(questionOf(msg.text, self?.username), st);
    await api.sendMessage(chat.id, answer, msg.message_id).catch(() => undefined);
    return;
  }
  const deleted = await api.deleteMessage(chat.id, msg.message_id).catch(() => false);
  if (!deleted) return;
  if (action === "flood") {
    const until = Math.floor(Date.now() / 1000) + st.muteMinutes * 60;
    const muted = await api.restrictMember(chat.id, user.id, until).catch(() => false);
    if (muted && st.cooldown.ready(chat.id, `flood:${String(user.id)}`)) {
      const name = (user.first_name ?? "A member").slice(0, 64);
      await api
        .sendMessage(chat.id, texts.floodNotice(name, st.muteMinutes))
        .catch(() => undefined);
    }
  } else if (action === "scam" && st.cooldown.ready(chat.id, "scam-notice")) {
    await api.sendMessage(chat.id, texts.SCAM_NOTICE).catch(() => undefined);
  }
}

/** The Bot API over fetch. The token is only in the request URL, which is never logged. */
export function botApi(token: string, fetchFn: typeof fetch = fetch): TelegramApi {
  const call = async <T>(method: string, body: Record<string, unknown>): Promise<T> => {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!data.ok) throw new Error(`${method} failed`);
    return data.result as T;
  };
  return {
    async sendMessage(chatId, text, replyTo) {
      await call("sendMessage", {
        chat_id: chatId,
        text,
        link_preview_options: { is_disabled: true },
        ...(replyTo
          ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } }
          : {}),
      });
    },
    async deleteMessage(chatId, messageId) {
      return call<boolean>("deleteMessage", { chat_id: chatId, message_id: messageId });
    },
    async restrictMember(chatId, userId, untilUnix) {
      return call<boolean>("restrictChatMember", {
        chat_id: chatId,
        user_id: userId,
        until_date: untilUnix,
        permissions: { can_send_messages: false },
      });
    },
    async leaveChat(chatId) {
      await call("leaveChat", { chat_id: chatId });
    },
    async me() {
      return call<TgUser>("getMe", {});
    },
    async adminIds(chatId) {
      const admins = await call<{ user: { id: number } }[]>("getChatAdministrators", {
        chat_id: chatId,
      });
      return admins.map((a) => a.user.id);
    },
  };
}
