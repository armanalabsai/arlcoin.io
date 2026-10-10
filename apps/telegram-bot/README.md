# ARL community bot (Telegram)

Status: **IN DEVELOPMENT.** Code and tests only; not deployed.

Moderates the community group https://t.me/arlcoin_community and answers three commands.

| Feature           | Behaviour                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `/start`          | What ARL is and its current status (testnet token, mainnet target, payment rail in development, no audit), with official links   |
| `/help`           | Command list and official channels                                                                                                |
| `/rules`          | Group rules and the security notice                                                                                               |
| Welcome           | Greets new members with the rules pointer and the security notice                                                                |
| Scam filter       | Deletes messages matching known scam patterns (seed phrase requests, "DM me", fake support, wallet "validation", paid promotion) |
| New-member limits | Links and forwarded posts from members who joined less than 24 hours ago are deleted                                             |
| Flood control     | More than 5 messages in 10 seconds: the message is deleted and the member is muted for 10 minutes                                 |
| Command cooldown  | In groups each command answers at most once per 30 seconds, so the bot itself cannot be used to flood                             |
| Chat allow list   | With `ALLOWED_CHAT_IDS` set, the bot leaves any other group it is added to                                                       |

Admins are never moderated. The admin list is read from Telegram and cached for 10 minutes.

## Security

- **Secrets only in the environment.** `TELEGRAM_BOT_TOKEN` and `WEBHOOK_SECRET` are read from
  environment variables. They are never written to disk, committed or logged. The `httpx`
  request log, which contains the token in every Bot API URL, is lowered to WARNING.
- **Webhook authentication.** Telegram sends `WEBHOOK_SECRET` in the
  `X-Telegram-Bot-Api-Secret-Token` header. Updates without it are rejected. The webhook URL
  path is fixed (`/telegram`); the secret is never part of the URL.
- **HTTPS only.** `PUBLIC_URL` must start with `https://`, or the bot refuses to start.
- **Least privilege.** In the group, make the bot an admin with only **Delete messages** and
  **Ban users** (needed to mute). Leave every other permission off.
- **Minimal data.** The bot keeps only user ids, join times and message timestamps in memory.
  It stores no message text, and the error log records the error type only.
- **Pinned dependencies.** `requirements.txt` pins every package. `pip-audit -r requirements.txt`
  reported no known vulnerabilities on 2026-10-10.
- **Token leak response.** If the token is ever exposed, revoke it in @BotFather (`/revoke`), set
  the new token in Render, and redeploy.

## Operating limits (free tier)

Checked 2026-10-10. Re-check before deploying; providers change their free tiers.

| Host                       | Free tier                                                                            | Fit                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Render (chosen)            | Web services only; spin down after 15 minutes without traffic; about 1 minute to wake | Works in webhook mode: an incoming update wakes the service. The first update after idle is handled about a minute late.  |
| Render background worker   | Not free (paid plans only)                                                           | Polling mode would need this; not used                                                                                     |
| Railway                    | Small monthly usage credit, not enough for an always-on process                      | Not suitable for a 24/7 bot at zero cost                                                                                    |

Consequences of the free tier, accepted for a new group:

- Spam that arrives while the service is asleep is removed about a minute later, not instantly.
- State is in memory. A spin-down or restart clears flood counters and the 24-hour new-member
  list, so a member who joined before the restart is not treated as new.
- Telegram retries a webhook delivery that fails; it may give up after repeated failures. If the
  group becomes busy enough for this to matter, move to a paid always-on instance and set
  `BOT_MODE=polling`.

## Environment

| Variable             | Required     | Value                                                                       |
| -------------------- | ------------ | --------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | yes          | From @BotFather                                                             |
| `BOT_MODE`           | no           | `webhook` (default) or `polling`                                            |
| `PUBLIC_URL`         | webhook mode | The Render service URL, for example `https://arl-telegram-bot.onrender.com` |
| `WEBHOOK_SECRET`     | webhook mode | 32 to 256 characters of `A-Z a-z 0-9 _ -`. Generate with `openssl rand -hex 32` |
| `ALLOWED_CHAT_IDS`   | recommended  | The group's chat id, for example `-1001234567890`                          |
| `MUTE_MINUTES`       | no           | 1 to 1440, default 10                                                       |

## Run the tests

```sh
cd apps/telegram-bot
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
```

## Deploy (owner action)

Nothing here has been deployed. These steps are for the owner.

1. In @BotFather: `/newbot`, keep the token private. Then `/setprivacy` → **Disable**, so the bot
   can read group messages to moderate them.
2. In Render: **New → Blueprint**, select this repository. Render reads `apps/telegram-bot/render.yaml`.
   Enter `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET` (from `openssl rand -hex 32`) and, after the first
   deploy shows the service URL, `PUBLIC_URL`. Redeploy.
3. Add the bot to https://t.me/arlcoin_community as an admin with only **Delete messages** and
   **Ban users**.
4. Read the group's chat id from the Render log line "added to chat ...", set
   `ALLOWED_CHAT_IDS`, and redeploy.
5. Check: send `/help` in the group; send `dm me` from a non-admin account and confirm it is deleted.
