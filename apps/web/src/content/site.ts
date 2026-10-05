// Site-wide constants. The domain is configuration, not a claim about content.

export const SITE = {
  name: "ARL",
  url: "https://arlcoin.io",
  description:
    "ARL is the utility token for AI and compute services on Base: 21,000,000 ARL fixed supply, no owner, mint or upgrade. Live on Base Sepolia testnet; Base Mainnet launch targeted for 2026-12-01.",
  /** Short line under the Core on the overview. */
  tagline: "The utility token for AI and compute services on Base. Live on Base Sepolia testnet.",
  repository: "https://gitlab.com/armanalabs-group/arlcoin",
  /** Public contact address of the team. */
  email: "armanalabsai@gmail.com",
  /** Official social accounts. */
  social: { instagram: "https://www.instagram.com/armanalabsai" },
  /** Base Sepolia (testnet) deployment, source-verified on Basescan, Blockscout and Sourcify. */
  testnet: {
    chain: "Base Sepolia",
    token: "0x244312b619127B6458154F3467eFD7c87CD28500",
    explorer: "https://sepolia.basescan.org/token/0x244312b619127B6458154F3467eFD7c87CD28500",
  },
  /** Target date of the Base Mainnet token deployment (the TGE). */
  tgeTarget: "2026-12-01",
} as const;

export const repoDoc = (path: string): `https://${string}` =>
  `https://gitlab.com/armanalabs-group/arlcoin/-/blob/main/${path}`;

/** Pages outside the Core. */
export const SITE_PAGES = ["/whitelist", "/contact", "/privacy", "/terms"] as const;

export const NOT_DEPLOYED = "Not yet on Base Mainnet";

/** Social preview image (app/opengraph-image.png). Pages that set `openGraph` repeat it,
 * because a page-level `openGraph` object replaces the inherited one. */
export const OG_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "ARL · 21,000,000 ARL maximum supply",
} as const;

export const TOKEN_DISCLAIMER =
  "ARL is deployed on the Base Sepolia testnet only; testnet tokens have no value. No ARL contract exists on Base Mainnet, nothing is for sale, and nothing here is an offer, investment advice or a promise of listing. No independent audit has been performed.";
