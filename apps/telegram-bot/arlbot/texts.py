"""User-facing text. English only; every factual claim matches docs/ in this repository."""

import time

WEBSITE = "https://arlcoin.io"
SOURCE = "https://github.com/armanalabsai/arlcoin.io"
X_ACCOUNT = "https://x.com/arlprotocol"
EMAIL = "team@arlcoin.io"
COMMUNITY = "https://t.me/arlcoin_community"
APP = "https://arlcoin.io/app/"
WHITELIST = "https://arlcoin.io/whitelist/"
MAINNET_TARGET = "2026-10-23"
TESTNET_TOKEN = "0x244312b619127B6458154F3467eFD7c87CD28500"

SCAM_WARNING = (
    "Security notice\n"
    "- The ARL team never sends the first direct message.\n"
    "- We never ask for a seed phrase, a private key or a payment.\n"
    "- There is no \"support\" account that fixes wallets.\n"
    f"- Official links are only on {WEBSITE}.\n"
    f"- There is no airdrop at launch. Any airdrop or claim link posted before the official announcement on {WEBSITE} is a scam.\n"
    "- Base Mainnet contract addresses will be published there only after deployment is verified. "
    "Any mainnet address posted before that is fake."
)

RULES = (
    "Group rules\n"
    "1. English only.\n"
    "2. No price talk, no promises of returns, no shilling other tokens.\n"
    "3. No links or forwarded posts during your first 24 hours in the group.\n"
    "4. No direct-message offers: promotion, listing or \"support\" offers are removed.\n"
    "5. Be respectful. Repeated flooding mutes you automatically.\n\n"
    f"{SCAM_WARNING}"
)

START = (
    "ARL Protocol: a payment rail for AI and compute services on Base.\n\n"
    "- ARL token: 21,000,000 fixed supply, no mint function, no owner, no upgrade proxy.\n"
    f"- Live on Base Sepolia testnet: {TESTNET_TOKEN}\n"
    f"- Try the testnet app (faucet, staking, jobs, x402 per-use payments, anonymous polls): {APP}\n"
    "  Testnet ARL has no value.\n"
    "- Base Mainnet: targeted for 2026-10-23, not deployed yet.\n"
    "- No airdrop at launch. An airdrop of 500,000 ARL is planned for a later date; "
    "date, eligibility and rules will be announced later on the official channels.\n"
    "- A bug bounty paid in ARL is open.\n\n"
    f"Website: {WEBSITE}\n"
    f"X: {X_ACCOUNT}\n"
    f"Telegram: {COMMUNITY}\n"
    f"Contact: {EMAIL}\n"
    f"Source code: {SOURCE}\n\n"
    "Type /help for commands."
)

HELP = (
    "Commands\n"
    "/start - what ARL is and where things stand\n"
    "/rules - group rules and the security notice\n"
    "/app - open the testnet app\n"
    "/faucet - how to get testnet ARL\n"
    "/status - faucet and staking status, read live from the testnet\n"
    "/launch - countdown to the Base Mainnet target\n"
    "/whitelist - whitelist registration\n"
    "/help - this list\n\n"
    f"App (testnet): {APP}\n"
    f"Community: {COMMUNITY}\n"
    f"Updates: {X_ACCOUNT}"
)


def welcome(first_name: str) -> str:
    name = (first_name or "there").strip()[:64]
    return (
        f"Welcome, {name}.\n\n"
        "Please read /rules. Links and forwarded posts are blocked during your first 24 hours.\n\n"
        f"{SCAM_WARNING}"
    )


FLOOD_NOTICE = "{name} is muted for {minutes} minutes for flooding the group."
SCAM_NOTICE = "A message was removed: it matched a known scam pattern. Read /rules."


APP_TEXT = (
    f"ARL testnet app: {APP}\n\n"
    "Faucet, staking, escrowed jobs, x402 per-use payments and anonymous polls on Base Sepolia.\n"
    "Testnet ARL has no value."
)

FAUCET_TEXT = (
    "Get testnet ARL\n"
    "1. Add the Base Sepolia network to your wallet.\n"
    f"2. Open {APP} and connect your wallet.\n"
    "3. Press Faucet: 1,000 testnet ARL, once per address about every 24 hours.\n\n"
    "You need a little Base Sepolia ETH for gas; public Base Sepolia faucets provide it.\n"
    "Testnet ARL has no value and cannot be sold."
)

WHITELIST_TEXT = (
    f"Whitelist registration: {WHITELIST}\n\n"
    "Registration is free. Nobody from ARL will ever ask you for a payment, a private key or a "
    "seed phrase to register."
)

STATUS_UNAVAILABLE = "Status is unavailable right now. Try again in a minute."


def _days_hours(seconds: int) -> str:
    days, rest = divmod(max(0, seconds), 86400)
    hours = rest // 3600
    return f"{days} days {hours} hours" if days else f"{hours} hours"


def launch(now_unix: int) -> str:
    # Midnight UTC on the target date; the date is a target, not a commitment.
    target = 1792713600  # 2026-10-23T00:00:00Z
    left = target - now_unix
    if left > 0:
        head = f"Base Mainnet launch target: {MAINNET_TARGET} ({_days_hours(left)} to go)."
    else:
        head = f"The Base Mainnet launch target was {MAINNET_TARGET}."
    return (
        f"{head}\n"
        f"Contract addresses will be published on {WEBSITE} only after the deployment is verified. "
        "Any mainnet address posted elsewhere is fake.\n"
        "There is no airdrop at launch."
    )


def status(faucet_arl, faucet_amount, period_finish, now_unix: int) -> str:
    lines = ["ARL testnet status (Base Sepolia)"]
    if faucet_arl is None:
        lines.append("- Faucet: unknown right now")
    elif faucet_amount and faucet_arl >= faucet_amount:
        lines.append(f"- Faucet: open, {faucet_arl:,} testnet ARL left ({faucet_amount:,} per claim)")
    else:
        lines.append("- Faucet: empty, waiting for a refill")
    if period_finish is None:
        lines.append("- Staking rewards: unknown right now")
    elif period_finish > now_unix:
        end = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(period_finish))
        lines.append(f"- Staking rewards: running until {end}")
    else:
        lines.append("- Staking rewards: not running")
    lines.append(f"\nTry it: {APP}\nTestnet ARL has no value.")
    return "\n".join(lines)
