// Cloudflare Worker for the ARL community bot (Telegram webhook).
//
// Secrets and variables of the Worker (Cloudflare dashboard → Workers → arl-telegram-bot →
// Settings → Variables and Secrets), set by the owner, never in a file or a commit:
//   TELEGRAM_BOT_TOKEN  secret, from @BotFather
//   WEBHOOK_SECRET      secret, 32-256 characters of A-Z a-z 0-9 _ -; Telegram sends it in the
//                       X-Telegram-Bot-Api-Secret-Token header and other requests are refused
//   ALLOWED_CHAT_IDS    optional, comma-separated group ids; the bot leaves any other group
//   MUTE_MINUTES        optional, default 10
//
// Endpoints: POST /telegram (the webhook), GET / (health, no data).

import { State, botApi, handleUpdate, type TgUpdate } from "./bot.ts";

export interface Env {
  TELEGRAM_BOT_TOKEN?: string;
  WEBHOOK_SECRET?: string;
  ALLOWED_CHAT_IDS?: string;
  MUTE_MINUTES?: string;
}

const SECRET_RE = /^[A-Za-z0-9_-]{32,256}$/;

export function parseChatIds(raw: string | undefined): Set<number> | null {
  const ids = (raw ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map(Number)
    .filter(Number.isSafeInteger);
  return ids.length ? new Set(ids) : null;
}

/** Constant-time comparison of the webhook secret header. */
export function sameSecret(a: string | null, b: string): boolean {
  if (a === null || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

let state: State | null = null;

export async function handleRequest(
  req: Request,
  env: Env,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname === "/") return new Response("ok");
  if (url.pathname !== "/telegram" || req.method !== "POST")
    return new Response("not found", { status: 404 });

  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const secret = env.WEBHOOK_SECRET?.trim() ?? "";
  if (!token || !SECRET_RE.test(secret)) return new Response("not configured", { status: 503 });
  if (!sameSecret(req.headers.get("x-telegram-bot-api-secret-token"), secret))
    return new Response("forbidden", { status: 403 });

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return new Response("bad request", { status: 400 });
  }
  state ??= new State(
    parseChatIds(env.ALLOWED_CHAT_IDS),
    Math.max(1, Math.min(1440, Number(env.MUTE_MINUTES ?? "10") || 10)),
  );
  try {
    await handleUpdate(update, botApi(token, fetchFn), state);
  } catch (e) {
    // Log the error type only: updates contain user names and message text. The Worker's
    // console output is its log.
    // eslint-disable-next-line no-console
    console.error(`update failed: ${e instanceof Error ? e.name : "error"}`);
  }
  return new Response("ok");
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handleRequest(req, env);
  },
};
