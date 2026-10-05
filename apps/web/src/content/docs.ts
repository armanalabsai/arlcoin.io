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
    description: "How to report a vulnerability privately, and what is in scope.",
  },
  {
    slug: "architecture",
    source: "docs/architecture.md",
    title: "Architecture",
    description: "How the ARL contracts, packages and apps fit together.",
  },
  {
    slug: "tokenomics",
    source: "docs/tokenomics.md",
    title: "Tokenomics",
    description: "Supply, the 11 allocations and their vesting.",
  },
  {
    slug: "token-design",
    source: "docs/token-design.md",
    title: "Token, vesting and treasury",
    description: "The token contract, vesting wallets and the treasury timelock.",
  },
  {
    slug: "security-analysis",
    source: "docs/security-analysis.md",
    title: "Security analysis",
    description: "The internal review: tests, static analysis and symbolic checks.",
  },
  {
    slug: "payments",
    source: "docs/payments.md",
    title: "AI payments",
    description: "Paying for AI services per use in ARL with x402 upto.",
  },
  {
    slug: "zk-privacy",
    source: "docs/zk-privacy.md",
    title: "ZK privacy",
    description: "Anonymous signals with zero-knowledge proofs.",
  },
  {
    slug: "chain-evaluation",
    source: "docs/chain-evaluation.md",
    title: "Chain evaluation",
    description: "How the deployment chain is being evaluated.",
  },
  {
    slug: "deployment",
    source: "docs/deployment.md",
    title: "Deployment",
    description: "The deployment tooling and runbook.",
  },
  {
    slug: "app",
    source: "docs/app.md",
    title: "ARL app",
    description: "The wallet app: vesting, staking, payments and more.",
  },
  {
    slug: "contributing",
    source: "CONTRIBUTING.md",
    title: "Contributing",
    description: "How to contribute to ARL.",
  },
  {
    slug: "third-party-licenses",
    source: "THIRD_PARTY_LICENSES.md",
    title: "Third-party licenses",
    description: "The open source components ARL uses and their licences.",
  },
  {
    slug: "staking-contract",
    source: "contracts/src/ARLStakingRewards.sol",
    title: "ARLStakingRewards.sol",
    description: "Source of the staking rewards contract.",
  },
];

export const docPath = (slug: string): `/${string}` => `/docs/${slug}`;

/** The site page for a repository file; throws at build time if the file is not published. */
export function docPathFor(source: string): `/${string}` {
  const entry = DOCS.find((d) => d.source === source);
  if (!entry) throw new Error(`${source} is not published under /docs`);
  return docPath(entry.slug);
}
