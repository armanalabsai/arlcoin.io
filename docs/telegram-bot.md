# Community bot

The bot that moderates the chat group https://t.me/arlprotocol_chat (linked to the announcement
channel https://t.me/arlprotocol_community). Code: [`packages/telegram-bot`](../packages/telegram-bot);
it runs as the Cloudflare Worker `arl-telegram-bot` on a Telegram webhook. It replaces the Python
bot that ran on Render until 2026-10-31.

## What it does

| Feature       | Rule                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Commands      | `/start`, `/rules`, `/app`, `/faucet`, `/status`, `/launch`, `/whitelist`, `/help`; once per 30 s per command in a group, always in private |
| `/status`     | Faucet float from `arlcoin.io/api/operator/status` and the staking reward window from Base Sepolia, cached 60 s                             |
| Scam filter   | Messages matching known drainer, fake-support and paid-promotion phrases are deleted, with one notice per 30 s                              |
| New members   | Links and forwarded posts are deleted during a member's first 24 hours                                                                      |
| Flood control | More than 5 messages in 10 s: the message is deleted and the member muted for `MUTE_MINUTES` (10)                                           |
| Admins        | Never moderated                                                                                                                             |
| Other groups  | With `ALLOWED_CHAT_IDS` set, the bot leaves any group not on the list                                                                       |

State (flood counters, join times, cooldowns) lives in the Worker's memory and starts empty in a
new isolate.

## Security

- The bot token is the Worker secret `TELEGRAM_BOT_TOKEN`, set by the owner in the Cloudflare
  dashboard. It is never written to the repository, a file or a log.
- The webhook only accepts requests carrying `WEBHOOK_SECRET` in Telegram's
  `X-Telegram-Bot-Api-Secret-Token` header (compared in constant time); everything else gets 403.
- Logs hold the error type only, never update payloads (names, message text).
- In the group the bot needs only two admin rights: delete messages and restrict members.

## Owner setup

1. @BotFather: create the bot (or reuse @Arlprotocol_bot after revoking its old token).
2. From `packages/telegram-bot`: `npx wrangler@4.40.0 deploy` creates the Worker.
3. Cloudflare → Workers → `arl-telegram-bot` → Settings → Variables and Secrets: add
   `TELEGRAM_BOT_TOKEN` and `WEBHOOK_SECRET` (type Secret), optionally `ALLOWED_CHAT_IDS`.
4. Point Telegram at the Worker once, from a terminal (the token stays in that terminal):
   `curl "https://api.telegram.org/bot$TOKEN/setWebhook" -d url=https://arl-telegram-bot.<account>.workers.dev/telegram -d secret_token=$WEBHOOK_SECRET -d 'allowed_updates=["message","edited_message"]'`
5. Add the bot to the group as admin with "Delete messages" and "Ban users" only.

## Tests

`npm test -w @arl/telegram-bot` (33 tests, ported from the Python bot's suite): spam rules, texts,
chain parsing, group moderation, commands and the webhook's secret check. Root `npm test` and CI
run them with every other workspace.
