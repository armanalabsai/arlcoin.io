// Repository documents published on the site under /docs, so the links in the Core and the
// footer work without any code host. Each entry is a file in the repository; the page is
// rendered from it at build time.

export interface DocEntry {
  readonly slug: string;
  /** Path from the repository root. */
  readonly source: string;
  readonly title: string;
  readonly description: string;
}

export const DOCS: readonly DocEntry[] = [
  {
    slug: "security",
    source: "SECURITY.md",
    title: "Security policy",
    description:
      "ARL Protocol security policy: how to report a vulnerability privately, and what is in scope.",
  },
  {
    slug: "architecture",
    source: "docs/architecture.md",
    title: "Architecture",
    description:
      "The architecture of ARL Protocol: how the contracts on Base, the packages and the apps fit together.",
  },
  {
    slug: "tokenomics",
    source: "docs/tokenomics.md",
    title: "Tokenomics",
    description:
      "ARL tokenomics: the fixed supply of 21,000,000 ARL, the 11 allocations and their vesting.",
  },
  {
    slug: "token-design",
    source: "docs/token-design.md",
    title: "Token, vesting and treasury",
    description:
      "The design of the ARL token on Base: the token contract, vesting wallets and the treasury timelock.",
  },
  {
    slug: "security-analysis",
    source: "docs/security-analysis.md",
    title: "Security analysis",
    description:
      "ARL Protocol security analysis: threats and controls, with tests, static analysis and symbolic checks.",
  },
  {
    slug: "security-audit",
    source: "security/2026-10-17/report.md",
    title: "Security audit report",
    description: "The 17 October 2026 audit: scope, tool results, findings and their status.",
  },
  {
    slug: "bug-bounty",
    source: "docs/bug-bounty.md",
    title: "Bug bounty",
    description:
      "The ARL Protocol bug bounty: rewards in ARL for valid vulnerability reports, and the rules.",
  },
  {
    slug: "payments",
    source: "docs/payments.md",
    title: "AI payments",
    description:
      "AI payments with ARL: paying for AI services per use over HTTP 402 with the x402 upto scheme.",
  },
  {
    slug: "zk-privacy",
    source: "docs/zk-privacy.md",
    title: "ZK privacy",
    description:
      "Anonymous signals with zero-knowledge proofs, in development and not on Base Mainnet yet.",
  },
  {
    slug: "chain-evaluation",
    source: "docs/chain-evaluation.md",
    title: "Chain evaluation",
    description: "Why ARL runs on Base Mainnet: what each protocol layer requires of a chain.",
  },
  {
    slug: "mainnet-services",
    source: "docs/mainnet-services.md",
    title: "Mainnet services",
    description: "The ARL network services deployed on Base Mainnet, with their addresses.",
  },
  {
    slug: "app",
    source: "docs/app.md",
    title: "ARL app",
    description:
      "The ARL app on Base Mainnet: wallet, vesting, staking, trading, jobs and the ARLscan explorer.",
  },
  {
    slug: "contributing",
    source: "CONTRIBUTING.md",
    title: "Contributing",
    description:
      "How to contribute to ARL Protocol: requirements, setup, checks and the pull request process.",
  },
  {
    slug: "third-party-licenses",
    source: "THIRD_PARTY_LICENSES.md",
    title: "Third-party licenses",
    description: "The open source components ARL Protocol builds on, and the licence of each.",
  },
  {
    slug: "staking-contract",
    source: "contracts/src/ARLStakingRewards.sol",
    title: "ARLStakingRewards.sol",
    description:
      "The Solidity source of ARLStakingRewards, the contract that pays staking rewards in ARL.",
  },
];

export const docPath = (slug: string): `/${string}` => `/docs/${slug}`;

/** The site page for a repository file; throws at build time if the file is not published. */
export function docPathFor(source: string): `/${string}` {
  const entry = DOCS.find((d) => d.source === source);
  if (!entry) throw new Error(`${source} is not published under /docs`);
  return docPath(entry.slug);
}
