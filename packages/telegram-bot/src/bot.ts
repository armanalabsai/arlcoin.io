// ARL community bot: commands, welcome messages and spam protection, on Telegram webhook
// updates. Kept free of the hosting runtime: the Worker (worker.ts) passes each update in.

import { StatusReader } from "./chain.ts";
import { Cooldown, FloodLimiter, NewMembers, decide } from "./spam.ts";
import * as texts from "./texts.ts";

/** The parts of a Telegram update the bot reads (Bot API types, trimmed). */
export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
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
}

const ADMIN_CACHE_MS = 600_000;

export class State {
  readonly flood = new FloodLimiter();
  readonly members = new NewMembers();
  readonly cooldown = new Cooldown();
  readonly admins = new Map<number, { at: number; ids: Set<number> }>();
  status = new StatusReader();
  readonly allowedChats: Set<number> | null;
  readonly muteMinutes: number;
  constructor(allowedChats: Set<number> | null, muteMinutes: number) {
    this.allowedChats = allowedChats;
    this.muteMinutes = muteMinutes;
  }
}

export const COMMANDS: Record<string, () => string | Promise<string>> = {
  start: () => texts.START,
  help: () => texts.HELP,
  rules: () => texts.RULES,
  app: () => texts.APP_TEXT,
  faucet: () => texts.FAUCET_TEXT,
  launch: () => texts.LAUNCH,
  whitelist: () => texts.WHITELIST_TEXT,
  status: () => "",
};

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
  if (s.faucetArl === null && s.rewardPeriodFinish === null) return texts.STATUS_UNAVAILABLE;
  return texts.status(
    s.faucetArl,
    s.faucetAmount,
    s.rewardPeriodFinish,
    Math.floor(Date.now() / 1000),
  );
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
    if (isGroup && !st.cooldown.ready(chat.id, command)) return;
    const reply = COMMANDS[command];
    if (!reply) return;
    const text = command === "status" ? await statusText(st) : await reply();
    await api.sendMessage(chat.id, text, msg.message_id).catch(() => undefined);
    return;
  }
  if (!isGroup) return;

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
  if (action === null) return;
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
    async adminIds(chatId) {
      const admins = await call<{ user: { id: number } }[]>("getChatAdministrators", {
        chat_id: chatId,
      });
      return admins.map((a) => a.user.id);
    },
  };
}
