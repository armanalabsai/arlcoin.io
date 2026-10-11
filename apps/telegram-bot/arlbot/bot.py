"""ARL community bot: /start, /help, /rules, welcome messages and spam protection.

Configuration comes only from environment variables; nothing secret is written to disk or logs.

    TELEGRAM_BOT_TOKEN   required. From @BotFather.
    BOT_MODE             "webhook" (default) or "polling".
    PUBLIC_URL           webhook mode: the service's public https URL, no trailing slash.
    WEBHOOK_SECRET       webhook mode: 32+ random characters [A-Za-z0-9_-]; Telegram sends it in
                         a header and updates without it are rejected.
    PORT                 webhook mode: port to listen on (Render sets it).
    ALLOWED_CHAT_IDS     optional, comma-separated chat ids; the bot leaves any other group.
    MUTE_MINUTES         optional, default 10.
"""

from __future__ import annotations

import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, FrozenSet, Optional, Tuple

from telegram import ChatPermissions, Update
from telegram.constants import ChatType, UpdateType
from telegram.error import TelegramError
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from . import spam, texts

log = logging.getLogger("arlbot")

ALLOWED_UPDATES = [UpdateType.MESSAGE, UpdateType.EDITED_MESSAGE]
ADMIN_CACHE_SECONDS = 600
_SECRET_RE = re.compile(r"^[A-Za-z0-9_-]{32,256}$")


def configure_logging() -> None:
    logging.basicConfig(format="%(asctime)s %(levelname)s %(name)s: %(message)s", level=logging.INFO)
    # httpx logs every request URL at INFO, and Bot API URLs contain the bot token.
    for noisy in ("httpx", "httpcore", "telegram.ext.Updater"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


class State:
    def __init__(self, allowed_chats: Optional[FrozenSet[int]], mute_minutes: int) -> None:
        self.allowed_chats = allowed_chats
        self.mute_minutes = mute_minutes
        self.flood = spam.FloodLimiter()
        self.members = spam.NewMembers()
        self.cooldown = spam.Cooldown()
        self.admins: Dict[int, Tuple[float, FrozenSet[int]]] = {}


def _state(context: ContextTypes.DEFAULT_TYPE) -> State:
    return context.application.bot_data["state"]


async def _admin_ids(context: ContextTypes.DEFAULT_TYPE, chat_id: int) -> FrozenSet[int]:
    st = _state(context)
    cached = st.admins.get(chat_id)
    if cached and time.monotonic() - cached[0] < ADMIN_CACHE_SECONDS:
        return cached[1]
    try:
        admins = await context.bot.get_chat_administrators(chat_id)
        ids = frozenset(a.user.id for a in admins)
    except TelegramError as exc:
        log.warning("could not read administrators of chat %s: %s", chat_id, type(exc).__name__)
        ids = cached[1] if cached else frozenset()
    st.admins[chat_id] = (time.monotonic(), ids)
    return ids


async def _reply_once(update: Update, context: ContextTypes.DEFAULT_TYPE, command: str, text: str) -> None:
    msg = update.effective_message
    chat = update.effective_chat
    if msg is None or chat is None:
        return
    if chat.type != ChatType.PRIVATE and not _state(context).cooldown.ready(chat.id, command):
        return
    await msg.reply_text(text, disable_web_page_preview=True)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _reply_once(update, context, "start", texts.START)


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _reply_once(update, context, "help", texts.HELP)


async def cmd_rules(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _reply_once(update, context, "rules", texts.RULES)


async def _guard_chat(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Leaves groups that are not on the allow list. Returns False if the update should be ignored."""
    chat = update.effective_chat
    allowed = _state(context).allowed_chats
    if chat is None or chat.type == ChatType.PRIVATE or allowed is None or chat.id in allowed:
        return True
    log.warning("leaving chat %s: not in ALLOWED_CHAT_IDS", chat.id)
    try:
        await context.bot.leave_chat(chat.id)
    except TelegramError:
        pass
    return False


async def on_new_members(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.effective_message
    chat = update.effective_chat
    if msg is None or chat is None or not await _guard_chat(update, context):
        return
    st = _state(context)
    for user in msg.new_chat_members or []:
        if user.is_bot:
            if user.id == getattr(context.bot, "id", None):
                log.info("added to chat %s; put this id in ALLOWED_CHAT_IDS", chat.id)
            continue
        st.members.joined(chat.id, user.id)
        if st.cooldown.ready(chat.id, "welcome"):
            await msg.reply_text(texts.welcome(user.first_name), disable_web_page_preview=True)


async def on_group_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.effective_message
    chat = update.effective_chat
    user = update.effective_user
    if msg is None or chat is None or user is None or not await _guard_chat(update, context):
        return
    if msg.sender_chat is not None and msg.sender_chat.id == chat.id:
        return  # anonymous admin posting as the group
    st = _state(context)
    text = msg.text or msg.caption
    entities = list(msg.entities or ()) + list(msg.caption_entities or ())
    is_admin = user.id in await _admin_ids(context, chat.id)
    action = spam.decide(
        text=text,
        is_admin=is_admin,
        is_forward=msg.forward_origin is not None,
        has_link_entity=any(e.type in ("url", "text_link") for e in entities),
        on_probation=st.members.on_probation(chat.id, user.id),
        flooding=False if is_admin else st.flood.hit(chat.id, user.id),
    )
    if action is None:
        return
    try:
        await msg.delete()
    except TelegramError as exc:
        log.warning("delete failed in chat %s: %s (is the bot an admin?)", chat.id, type(exc).__name__)
        return
    if action == "flood":
        until = datetime.now(timezone.utc) + timedelta(minutes=st.mute_minutes)
        try:
            await context.bot.restrict_chat_member(
                chat.id, user.id, ChatPermissions.no_permissions(), until_date=until
            )
        except TelegramError as exc:
            log.warning("mute failed in chat %s: %s", chat.id, type(exc).__name__)
            return
        if st.cooldown.ready(chat.id, f"flood:{user.id}"):
            name = (user.first_name or "A member")[:64]
            await context.bot.send_message(
                chat.id, texts.FLOOD_NOTICE.format(name=name, minutes=st.mute_minutes)
            )
    elif action == "scam" and st.cooldown.ready(chat.id, "scam-notice"):
        await context.bot.send_message(chat.id, texts.SCAM_NOTICE)


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    # Log the error type only: update payloads contain user names and message text.
    log.error("handler error: %s", type(context.error).__name__)


def build_application(token: str, state: State) -> Application:
    app = Application.builder().token(token).build()
    app.bot_data["state"] = state
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("rules", cmd_rules))
    groups = filters.ChatType.GROUPS
    app.add_handler(MessageHandler(groups & filters.StatusUpdate.NEW_CHAT_MEMBERS, on_new_members))
    app.add_handler(MessageHandler(groups & ~filters.StatusUpdate.ALL & ~filters.COMMAND, on_group_message))
    app.add_error_handler(on_error)
    return app


def _parse_chat_ids(raw: str) -> Optional[FrozenSet[int]]:
    raw = raw.strip()
    if not raw:
        return None
    return frozenset(int(x) for x in raw.split(",") if x.strip())


def main() -> int:
    configure_logging()
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        log.error("TELEGRAM_BOT_TOKEN is not set")
        return 2
    state = State(
        allowed_chats=_parse_chat_ids(os.environ.get("ALLOWED_CHAT_IDS", "")),
        mute_minutes=max(1, min(1440, int(os.environ.get("MUTE_MINUTES", "10")))),
    )
    app = build_application(token, state)
    mode = os.environ.get("BOT_MODE", "webhook").strip().lower()
    if mode == "polling":
        app.run_polling(allowed_updates=ALLOWED_UPDATES, drop_pending_updates=True)
        return 0
    if mode != "webhook":
        log.error("BOT_MODE must be 'webhook' or 'polling'")
        return 2
    public_url = os.environ.get("PUBLIC_URL", "").strip().rstrip("/")
    secret = os.environ.get("WEBHOOK_SECRET", "").strip()
    if not public_url.startswith("https://"):
        log.error("PUBLIC_URL must be an https URL")
        return 2
    if not _SECRET_RE.match(secret):
        log.error("WEBHOOK_SECRET must be 32-256 characters of A-Z, a-z, 0-9, _ or -")
        return 2
    # The URL path is fixed; the secret travels only in Telegram's X-Telegram-Bot-Api-Secret-Token header.
    app.run_webhook(
        listen="0.0.0.0",
        port=int(os.environ.get("PORT", "10000")),
        url_path="telegram",
        webhook_url=f"{public_url}/telegram",
        secret_token=secret,
        allowed_updates=ALLOWED_UPDATES,
        drop_pending_updates=False,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
