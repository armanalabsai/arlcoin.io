import asyncio
from types import SimpleNamespace

from telegram.constants import ChatType

from arlbot import bot, texts


class FakeMessage:
    def __init__(self, text=None, new_members=None, forward=None):
        self.text = text
        self.caption = None
        self.entities = ()
        self.caption_entities = ()
        self.forward_origin = forward
        self.sender_chat = None
        self.new_chat_members = new_members or []
        self.deleted = False
        self.replies = []

    async def delete(self):
        self.deleted = True

    async def reply_text(self, text, **_):
        self.replies.append(text)


class FakeBot:
    def __init__(self, admins=()):
        self.admins = admins
        self.sent = []
        self.restricted = []
        self.left = []

    async def get_chat_administrators(self, chat_id):
        return [SimpleNamespace(user=SimpleNamespace(id=i)) for i in self.admins]

    async def send_message(self, chat_id, text, **_):
        self.sent.append(text)

    async def restrict_chat_member(self, chat_id, user_id, perms, until_date=None):
        self.restricted.append(user_id)

    async def leave_chat(self, chat_id):
        self.left.append(chat_id)


def make(text=None, user_id=7, chat_id=-100, admins=(), allowed=None, new_members=None, forward=None, chat_type=ChatType.SUPERGROUP):
    state = bot.State(allowed_chats=allowed, mute_minutes=10)
    fbot = FakeBot(admins)
    msg = FakeMessage(text, new_members, forward)
    update = SimpleNamespace(
        effective_message=msg,
        effective_chat=SimpleNamespace(id=chat_id, type=chat_type),
        effective_user=SimpleNamespace(id=user_id, first_name="Ada", is_bot=False),
    )
    ctx = SimpleNamespace(bot=fbot, application=SimpleNamespace(bot_data={"state": state}))
    return update, ctx, msg, fbot, state


def run(coro):
    return asyncio.run(coro)


def test_scam_message_is_deleted_with_notice():
    update, ctx, msg, fbot, _ = make("DM me for listing")
    run(bot.on_group_message(update, ctx))
    assert msg.deleted and fbot.sent == [texts.SCAM_NOTICE]


def test_admin_is_never_moderated():
    update, ctx, msg, fbot, _ = make("DM me", user_id=1, admins=(1,))
    run(bot.on_group_message(update, ctx))
    assert not msg.deleted and fbot.sent == []


def test_flood_mutes_once():
    update, ctx, msg, fbot, state = make("hi")
    for _ in range(5):
        run(bot.on_group_message(update, ctx))
    assert not msg.deleted
    run(bot.on_group_message(update, ctx))
    assert msg.deleted and fbot.restricted == [7] and len(fbot.sent) == 1


def test_new_member_link_blocked_then_allowed_for_others():
    newbie = SimpleNamespace(id=7, first_name="Ada", is_bot=False)
    update, ctx, msg, fbot, state = make(new_members=[newbie])
    run(bot.on_new_members(update, ctx))
    assert msg.replies and msg.replies[0].startswith("Welcome, Ada.")
    upd2, _, msg2, _, _ = make("see https://example.com")
    run(bot.on_group_message(upd2, ctx))
    assert msg2.deleted
    upd3, _, msg3, _, _ = make("see https://example.com", user_id=8)
    run(bot.on_group_message(upd3, ctx))
    assert not msg3.deleted


def test_unlisted_group_is_left():
    update, ctx, msg, fbot, _ = make("hello", chat_id=-5, allowed=frozenset({-100}))
    run(bot.on_group_message(update, ctx))
    assert fbot.left == [-5]


def test_commands_have_group_cooldown_but_not_in_private():
    update, ctx, msg, _, _ = make()
    run(bot.cmd_help(update, ctx))
    run(bot.cmd_help(update, ctx))
    assert msg.replies == [texts.HELP]
    pupd, pctx, pmsg, _, _ = make(chat_type=ChatType.PRIVATE, chat_id=7)
    run(bot.cmd_start(pupd, pctx))
    run(bot.cmd_start(pupd, pctx))
    assert pmsg.replies == [texts.START, texts.START]


def test_build_application_registers_handlers():
    app = bot.build_application("123456:TEST-TOKEN-NOT-REAL", bot.State(None, 10))
    assert sum(len(h) for h in app.handlers.values()) == 5


def test_main_refuses_missing_or_weak_config(monkeypatch):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    assert bot.main() == 2
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123456:TEST")
    monkeypatch.setenv("BOT_MODE", "webhook")
    monkeypatch.setenv("PUBLIC_URL", "http://insecure.example")
    assert bot.main() == 2
    monkeypatch.setenv("PUBLIC_URL", "https://bot.example")
    monkeypatch.setenv("WEBHOOK_SECRET", "short")
    assert bot.main() == 2


def test_logging_hides_request_urls_that_contain_the_token():
    import logging

    bot.configure_logging()
    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING
    assert logging.getLogger("httpcore").getEffectiveLevel() >= logging.WARNING
