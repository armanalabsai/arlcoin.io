// User-facing text. English only; every factual claim matches docs/ in this repository.

export const WEBSITE = "https://arlcoin.io";
export const SOURCE = "https://github.com/armanalabsai/arlcoin.io";
export const X_ACCOUNT = "https://x.com/arlprotocol";
export const EMAIL = "team@arlcoin.io";
export const COMMUNITY = "https://t.me/arlprotocol_community";
export const APP = "https://arlcoin.io/app/";
export const WHITELIST = "https://arlcoin.io/whitelist/";
export const MAINNET_TOKEN = "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4";
export const BUY = "https://arlcoin.io/buy/";

export const SCAM_WARNING =
  "Security notice\n" +
  "- The ARL team never sends the first direct message.\n" +
  "- We never ask for a seed phrase, a private key or a payment.\n" +
  '- There is no "support" account that fixes wallets.\n' +
  `- Official links are only on ${WEBSITE}.\n` +
  `- There is no airdrop at launch. Any airdrop or claim link posted before the official announcement on ${WEBSITE} is a scam.\n` +
  `- The only official ARL contract on Base Mainnet is ${MAINNET_TOKEN}. ` +
  "Any other address presented as ARL is fake.";

export const RULES =
  "Group rules\n" +
  "1. English only.\n" +
  "2. No price talk, no promises of returns, no shilling other tokens.\n" +
  "3. No links or forwarded posts during your first 24 hours in the group.\n" +
  '4. No direct-message offers: promotion, listing or "support" offers are removed.\n' +
  "5. Be respectful. Repeated flooding mutes you automatically.\n\n" +
  SCAM_WARNING;

export const START =
  "ARL Protocol: a payment rail for AI and compute services on Base.\n\n" +
  "- ARL token: 21,000,000 fixed supply, no mint function, no owner, no upgrade proxy.\n" +
  `- Live on Base Mainnet since 2026-10-24: ${MAINNET_TOKEN}\n` +
  `- Trade in the official Uniswap v3 pools on Base: ${BUY}\n` +
  "- Verified jobs for AI agents on Base Mainnet: escrows paid in ARL or USDC, checked by staked ARL validators.\n" +
  `- Try the testnet app (faucet, staking, jobs, x402 per-use payments, anonymous polls): ${APP}\n` +
  "  Testnet ARL has no value.\n" +
  "- No airdrop at launch. An airdrop of 500,000 ARL is planned for a later date; " +
  "date, eligibility and rules will be announced later on the official channels.\n" +
  "- A bug bounty paid in ARL is open.\n\n" +
  `Website: ${WEBSITE}\n` +
  `X: ${X_ACCOUNT}\n` +
  `Telegram: ${COMMUNITY}\n` +
  `Contact: ${EMAIL}\n` +
  `Source code: ${SOURCE}\n\n` +
  "Type /help for commands.";

export const HELP =
  "Commands\n" +
  "/start - what ARL is and where things stand\n" +
  "/rules - group rules and the security notice\n" +
  "/app - open the testnet app\n" +
  "/faucet - how to get testnet ARL\n" +
  "/status - faucet and staking status, read live from the testnet\n" +
  "/launch - the Base Mainnet contract and where to buy\n" +
  "/whitelist - whitelist registration\n" +
  "/help - this list\n\n" +
  `App (testnet): ${APP}\n` +
  `Community: ${COMMUNITY}\n` +
  `Updates: ${X_ACCOUNT}`;

export function welcome(firstName: string | undefined): string {
  const name = (firstName ?? "").trim().slice(0, 64) || "there";
  return (
    `Welcome, ${name}.\n\n` +
    "Please read /rules. Links and forwarded posts are blocked during your first 24 hours.\n\n" +
    SCAM_WARNING
  );
}

export function floodNotice(name: string, minutes: number): string {
  return `${name} is muted for ${String(minutes)} minutes for flooding the group.`;
}
export const SCAM_NOTICE = "A message was removed: it matched a known scam pattern. Read /rules.";

export const APP_TEXT =
  `ARL testnet app: ${APP}\n\n` +
  "Faucet, staking, escrowed jobs, x402 per-use payments and anonymous polls on Base Sepolia.\n" +
  "Testnet ARL has no value.";

export const FAUCET_TEXT =
  "Get testnet ARL\n" +
  "1. Add the Base Sepolia network to your wallet.\n" +
  `2. Open ${APP} and connect your wallet.\n` +
  "3. Press Faucet: 1,000 testnet ARL, once per address about every 24 hours.\n\n" +
  "You need a little Base Sepolia ETH for gas; public Base Sepolia faucets provide it.\n" +
  "Testnet ARL has no value and cannot be sold.";

export const WHITELIST_TEXT =
  `Whitelist registration: ${WHITELIST}\n\n` +
  "Registration is free. Nobody from ARL will ever ask you for a payment, a private key or a " +
  "seed phrase to register.";

export const STATUS_UNAVAILABLE = "Status is unavailable right now. Try again in a minute.";

export const LAUNCH =
  "ARL is live on Base Mainnet since 2026-10-24.\n" +
  `Official contract: ${MAINNET_TOKEN} (source-verified on Basescan).\n` +
  `How to buy: ${BUY}\n` +
  "Any other address presented as ARL is fake. There is no airdrop at launch.";

const fmt = (n: number) => n.toLocaleString("en-US");

export function status(
  faucetArl: number | null,
  faucetAmount: number | null,
  periodFinish: number | null,
  nowUnix: number,
): string {
  const lines = ["ARL testnet status (Base Sepolia)"];
  if (faucetArl === null) lines.push("- Faucet: unknown right now");
  else if (faucetAmount && faucetArl >= faucetAmount)
    lines.push(
      `- Faucet: open, ${fmt(faucetArl)} testnet ARL left (${fmt(faucetAmount)} per claim)`,
    );
  else lines.push("- Faucet: empty, waiting for a refill");
  if (periodFinish === null) lines.push("- Staking rewards: unknown right now");
  else if (periodFinish > nowUnix) {
    const end = new Date(periodFinish * 1000).toISOString().slice(0, 16).replace("T", " ");
    lines.push(`- Staking rewards: running until ${end} UTC`);
  } else lines.push("- Staking rewards: not running");
  lines.push(`\nTry it: ${APP}\nTestnet ARL has no value.`);
  return lines.join("\n");
}
