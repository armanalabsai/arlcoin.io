"""User-facing text. English only; every factual claim matches docs/ in this repository."""

import time

WEBSITE = "https://arlcoin.io"
SOURCE = "https://github.com/armanalabsai/arlcoin.io"
X_ACCOUNT = "https://x.com/arlprotocol"
EMAIL = "team@arlcoin.io"
COMMUNITY = "https://t.me/arlcoin_community"
APP = "https://arlcoin.io/app/"
WHITELIST = "https://arlcoin.io/whitelist/"
MAINNET_TOKEN = "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4"
BUY = "https://arlcoin.io/buy/"

SCAM_WARNING = (
    "Security notice\n"
    "- The ARL team never sends the first direct message.\n"
    "- We never ask for a seed phrase, a private key or a payment.\n"
    "- There is no \"support\" account that fixes wallets.\n"
    f"- Official links are only on {WEBSITE}.\n"
    f"- There is no airdrop at launch. Any airdrop or claim link posted before the official announcement on {WEBSITE} is a scam.\n"
    f"- The only official ARL contract on Base Mainnet is {MAINNET_TOKEN}. "
    "Any other address presented as ARL is fake."
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
    f"- Live on Base Mainnet since 2026-10-24: {MAINNET_TOKEN}\n"
    f"- Trade in the official Uniswap v3 pools on Base: {BUY}\n"
    f"- Try the testnet app (faucet, staking, jobs, x402 per-use payments, anonymous polls): {APP}\n"
    "  Testnet ARL has no value.\n"
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


def launch(now_unix: int) -> str:
    del now_unix  # kept for the command handler's signature
    return (
        "ARL is live on Base Mainnet since 2026-10-24.\n"
        f"Official contract: {MAINNET_TOKEN} (source-verified on Basescan).\n"
        f"How to buy: {BUY}\n"
        "Any other address presented as ARL is fake. There is no airdrop at launch."
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
