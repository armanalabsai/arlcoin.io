// What the assistant knows: short, sourced answers to the questions the community asks most.
// English ASCII only; every fact matches docs/ in this repository (mainnet-plan.md,
// mainnet-services.md, architecture/MASTER-ARCHITECTURE-ROADMAP.md, bug-bounty.md). The same
// entries ground the optional model answers, so a fact that is not here is never stated.

import {
  APP,
  BUY,
  CHAT,
  COMMUNITY,
  EMAIL,
  MAINNET_TOKEN,
  SOURCE,
  WEBSITE,
  X_ACCOUNT,
} from "./texts.ts";

export const BUILD = "https://arlcoin.io/build/";
export const ROADMAP_DOC = `${SOURCE}/blob/main/docs/architecture/MASTER-ARCHITECTURE-ROADMAP.md`;
export const BOUNTY_DOC = `${SOURCE}/blob/main/docs/bug-bounty.md`;
export const SUPPLY_API = "https://arlcoin.io/api/supply";

/** Base Mainnet contracts the community may ask for (docs/mainnet-services.md). */
export const CONTRACTS: readonly (readonly [string, string])[] = [
  ["ARL token", MAINNET_TOKEN],
  ["Jobs escrow, paid in ARL", "0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC"],
  ["Jobs escrow, paid in USDC", "0xE3eA0EAEc3Cf9DA2d0856A0f784A4B1671AeFD04"],
  ["Verified evaluator (ARL escrow)", "0x0D160C869bd2a7AaEDd29e11fc60fdAEf21c3E28"],
  ["Verified evaluator (USDC escrow)", "0x7A00D45598Da7C13feEA8962fc1110FC4Db4D850"],
  ["Compute payments", "0x1bFE932896fdd32175836a7364dcaf53d49EE464"],
  ["Staking", "0x15e257009BE9B1875fbfa69D291320aaFE3fa102"],
];

export const CONTRACTS_TEXT =
  "ARL contracts on Base Mainnet (chain 8453)\n" +
  CONTRACTS.map(([name, addr]) => `- ${name}: ${addr}`).join("\n") +
  "\n\nCheck every address on basescan.org before you sign. Any other address presented as " +
  "ARL is fake.";

export const ROADMAP =
  "ARL roadmap\n" +
  "Done:\n" +
  "- Token, Safes, vesting and timelock on Base Mainnet (since 2026-10-24)\n" +
  "- Escrowed jobs in ARL or USDC, verified by staked validators, compute payments, staking\n" +
  "- SDKs: n8n node, TypeScript (arl-protocol-sdk), Python (arl_protocol)\n" +
  "- Open protocol standards: arl-task, arl-proof, arl-policy, arl-reputation, arl-evidence/2\n" +
  "- Agent API (arlcoin.io/api/v1) and the MCP server for AI agents\n" +
  "Now:\n" +
  "- Security hardening: ARLJobs v3 (live 16 November 2026) and evaluator v7 (live 19 November 2026)\n" +
  "- A 3-validator committee, AgentKit actions\n" +
  "Next:\n" +
  "1. A live pilot with real agent-to-agent jobs\n" +
  "2. An open validator set and decentralized disputes\n\n" +
  `Full roadmap: ${ROADMAP_DOC}`;

export const BUILD_TEXT =
  `Build with ARL: ${BUILD}\n\n` +
  "- No code: the n8n node n8n-nodes-arl\n" +
  "- TypeScript: npm install arl-protocol-sdk\n" +
  "- Python: the arl_protocol package, one Arl class\n" +
  "- AI agents: the Agent API at arlcoin.io/api/v1 or the MCP server (no key, unsigned transactions)\n" +
  "- Any language: plain contract calls, no API key\n\n" +
  "Every path uses the same five steps: create the job, set the budget, fund it, submit the " +
  "work, settle (pay or refund).\n" +
  `Source and docs: ${SOURCE}`;

export const VERIFIED_TEXT =
  "How a verified job works\n" +
  "1. The client opens a job in the escrow and funds it in ARL or USDC.\n" +
  "2. A committee of validators who staked ARL is proposed; the provider accepts it.\n" +
  "3. The provider submits the result. Validators check it and vote, each with a bond at stake.\n" +
  "4. After a challenge window anyone can dispute; an arbiter Safe rules and wrong votes are " +
  "slashed.\n" +
  "5. The escrow pays the provider or refunds the client.\n\n" +
  `Try it in the app: ${APP}`;

export const BOUNTY_TEXT =
  "Bug bounty, paid in ARL\n" +
  "- Critical: 40,000 ARL\n- High: 15,000 ARL\n- Medium: 4,000 ARL\n- Low: 500 ARL\n" +
  `Report privately to ${EMAIL}, never in the group. Rules: ${BOUNTY_DOC}`;

export const LINKS_TEXT =
  "Official links\n" +
  `- Website: ${WEBSITE}\n- App: ${APP}\n- Build: ${BUILD}\n- How to buy: ${BUY}\n` +
  `- X: ${X_ACCOUNT}\n- Announcements: ${COMMUNITY}\n- Chat: ${CHAT}\n` +
  `- Source code: ${SOURCE}\n- Contact: ${EMAIL}`;

export interface Entry {
  id: string;
  /** Lowercase words or phrases; a phrase counts double. */
  keys: readonly string[];
  answer: string;
}

export const ENTRIES: readonly Entry[] = [
  {
    id: "what",
    keys: ["what is arl", "what is this", "about", "project", "explain", "arl protocol"],
    answer:
      "ARL is a payment and verification layer for AI agents on Base. An agent can hire " +
      "another agent, lock the payment in an on-chain escrow, have staked validators check " +
      "the work, and pay only when the work is accepted (or get refunded). The ARL token " +
      "(21,000,000 fixed supply, no mint) pays for jobs, validator stakes and staking.\n\n" +
      `More: ${WEBSITE}`,
  },
  {
    id: "contract",
    keys: ["contract", "address", "ca", "token address", "official", "fake", "basescan"],
    answer: CONTRACTS_TEXT,
  },
  {
    id: "supply",
    keys: [
      "supply",
      "circulating",
      "total supply",
      "max supply",
      "mint",
      "tokenomics",
      "unlock",
      "vesting",
    ],
    answer:
      "Supply: 21,000,000 ARL, fixed. The token has no mint function, no owner and no upgrade " +
      "proxy. Vested allocations unlock after a 12-month cliff, then linearly over 36 months; " +
      `the full table is in the source code. Live circulating supply: ${SUPPLY_API} (or /supply).`,
  },
  {
    id: "buy",
    keys: ["buy", "where to buy", "uniswap", "swap", "trade", "pool", "liquidity", "dex"],
    answer:
      "ARL trades in the official Uniswap v3 pools on Base (against USDC, USDT, WETH and " +
      `cbBTC). Step by step: ${BUY}\nAlways check the token address: ${MAINNET_TOKEN}`,
  },
  {
    id: "price",
    keys: [
      "price",
      "pump",
      "dump",
      "chart",
      "market cap",
      "mcap",
      "worth",
      "invest",
      "profit",
      "moon",
    ],
    answer:
      "We don't discuss price or give investment advice here. You can see the live market in " +
      `the official pools: ${BUY}`,
  },
  {
    id: "cex",
    keys: [
      "cex",
      "exchange",
      "listing",
      "binance",
      "coinmarketcap",
      "cmc",
      "coingecko",
      "mexc",
      "gate",
    ],
    answer:
      "ARL is not on a centralized exchange today. A CoinMarketCap listing has been " +
      "requested and is not live yet. Any exchange news is announced first on " +
      `${COMMUNITY} and ${X_ACCOUNT}.`,
  },
  {
    id: "staking",
    keys: ["stake", "staking", "reward", "rewards", "yield", "earn"],
    answer:
      "Staking: stake ARL in the app and earn ARL rewards over 180-day periods. The first " +
      "period of 300,000 ARL starts when the Community & Staking Safe funds it. Live figures: " +
      `/status. Stake here: ${APP}`,
  },
  {
    id: "verified",
    keys: [
      "verified job",
      "verify",
      "validator",
      "validators",
      "committee",
      "escrow",
      "job",
      "jobs",
      "dispute",
    ],
    answer: VERIFIED_TEXT,
  },
  {
    id: "build",
    keys: [
      "build",
      "developer",
      "dev",
      "sdk",
      "api",
      "integrate",
      "n8n",
      "python",
      "typescript",
      "npm",
      "docs",
      "mcp",
    ],
    answer: BUILD_TEXT,
  },
  {
    id: "roadmap",
    keys: ["roadmap", "plan", "next", "when", "progress", "update", "news", "phase"],
    answer: ROADMAP,
  },
  {
    id: "airdrop",
    keys: ["airdrop", "claim", "free", "giveaway", "drop"],
    answer:
      "There is no airdrop at launch. An airdrop of 500,000 ARL is planned for a later date; " +
      "date, eligibility and rules will be announced on the official channels. Any claim link " +
      "before that is a scam.",
  },
  {
    id: "whitelist",
    keys: ["whitelist", "wl", "register", "presale", "sale"],
    answer:
      "Whitelist registration is free: https://arlcoin.io/whitelist/\nNobody from ARL will " +
      "ask for a payment, a private key or a seed phrase.",
  },
  {
    id: "security",
    keys: [
      "scam",
      "safe",
      "hack",
      "seed",
      "private key",
      "support",
      "dm",
      "wallet drained",
      "phishing",
    ],
    answer:
      "Stay safe: the ARL team never sends the first direct message and never asks for a seed " +
      "phrase, a private key or a payment. There is no support account that fixes wallets. " +
      `Official links only: ${WEBSITE}`,
  },
  {
    id: "bounty",
    keys: ["bug", "bounty", "vulnerability", "exploit", "security report"],
    answer: BOUNTY_TEXT,
  },
  {
    id: "contact",
    keys: ["contact", "email", "team", "founder", "partnership", "business", "collab", "marketing"],
    answer: `Team contact: ${EMAIL}. Business and partnership proposals go there too.`,
  },
  {
    id: "network",
    keys: ["base", "chain", "network", "ethereum", "bridge", "gas"],
    answer:
      "ARL runs on Base Mainnet (chain 8453), Coinbase's Ethereum layer 2. Gas is paid in ETH " +
      "on Base. ARL lives only on Base; any ARL on another chain is fake.",
  },
];

const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

/** The best matching entry for a question, or null when nothing matches. */
export function answerFor(question: string): Entry | null {
  const q = norm(question);
  if (q.trim() === "") return null;
  let best: Entry | null = null;
  let bestScore = 0;
  for (const e of ENTRIES) {
    let score = 0;
    for (const k of e.keys) if (q.includes(` ${k} `)) score += k.includes(" ") ? 2 : 1;
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

/** Every fact the assistant may use, for grounding a model answer. */
export const KNOWLEDGE = [...ENTRIES.map((e) => e.answer), ROADMAP, LINKS_TEXT].join("\n\n---\n\n");
