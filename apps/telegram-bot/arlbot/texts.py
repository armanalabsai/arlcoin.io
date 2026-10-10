"""User-facing text. English only; every factual claim matches docs/ in this repository."""

WEBSITE = "https://arlcoin.io"
WHITELIST = "https://arlcoin.io/whitelist/"
SOURCE = "https://github.com/armanalabsai/arlcoin.io"
X_ACCOUNT = "https://x.com/armanalabsai"
COMMUNITY = "https://t.me/arlcoin_community"
TESTNET_TOKEN = "0x244312b619127B6458154F3467eFD7c87CD28500"

SCAM_WARNING = (
    "Security notice\n"
    "- The ARL team never sends the first direct message.\n"
    "- We never ask for a seed phrase, a private key or a payment.\n"
    "- There is no \"support\" account that fixes wallets.\n"
    f"- Official links are only on {WEBSITE}.\n"
    "- Base Mainnet contract addresses will be published there only after deployment is verified. "
    "Any mainnet address posted before that is fake."
)

RULES = (
    "Group rules\n"
    "1. English only.\n"
    "2. No price talk, no promises of returns, no shilling other tokens.\n"
    "3. No links or forwarded posts during your first 24 hours in the group.\n"
    "4. No direct-message offers: promotion, listing, audit or \"support\" offers are removed.\n"
    "5. Be respectful. Repeated flooding mutes you automatically.\n\n"
    f"{SCAM_WARNING}"
)

START = (
    "ARL Network: a payment rail for AI and compute services on Base.\n\n"
    "- ARL token: 21,000,000 fixed supply, no mint function, no owner, no upgrade proxy.\n"
    f"- Live on Base Sepolia testnet: {TESTNET_TOKEN}\n"
    "- Base Mainnet: targeted for 2026-11-01, not deployed yet.\n"
    "- Per-use payments (x402 \"upto\"): in development, not deployed.\n"
    "- No independent audit. A bug bounty paid in ARL is open.\n\n"
    f"Website: {WEBSITE}\n"
    f"Whitelist: {WHITELIST}\n"
    f"Source code: {SOURCE}\n\n"
    "Type /help for commands."
)

HELP = (
    "Commands\n"
    "/start - what ARL is and where things stand\n"
    "/rules - group rules and the security notice\n"
    "/help - this list\n\n"
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
