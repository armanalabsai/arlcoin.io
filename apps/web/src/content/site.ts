import { docPathFor } from "./docs.ts";

// Site-wide constants. The domain is configuration, not a claim about content.

export const SITE = {
  name: "ARL",
  url: "https://arlcoin.io",
  description:
    "ARL Protocol: the utility token for AI and compute payments on Base. 21,000,000 ARL fixed supply, no mint or upgrade. Live on Base Mainnet.",
  /** Short line under the Core on the overview. */
  tagline: "The utility token for AI and compute services, live on Base.",
  /** Full project name, used in titles and structured data. */
  brand: "ARL Protocol",
  repository: "https://github.com/armanalabsai/arlcoin.io",
  /** Public contact email. */
  email: "team@arlcoin.io",
  /** Official social accounts. */
  social: {
    x: "https://x.com/arlprotocol",
    /** X handle, for card metadata. */
    xHandle: "@arlprotocol",
    /** Community group. */
    telegram: "https://t.me/arlcoin_community",
    /** Medium publication account. */
    medium: "https://medium.com/@arlprotocol",
  },
  /** Base Sepolia (testnet) deployment, source-verified on Basescan, Blockscout and Sourcify. */
  testnet: {
    chain: "Base Sepolia",
    token: "0x244312b619127B6458154F3467eFD7c87CD28500",
    explorer: "https://sepolia.basescan.org/token/0x244312b619127B6458154F3467eFD7c87CD28500",
  },
  /**
   * Base Mainnet deployment, deployed on 2026-10-24 (block 53,023,206) and source-verified on
   * Basescan. Setting `token` shows "Add ARL to your wallet" and the Uniswap link.
   */
  mainnet: {
    chain: "Base",
    token: "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4",
    explorer: "https://basescan.org/token/0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4",
    timelock: "0xF3820BC1510a9A1B9aa2b318Dd997127f198B1c2",
    deployedOn: "24 October 2026",
  },
  /** The TGE date: every vesting schedule starts here (the 12-month cliff ends 2027-10-23). */
  tgeTarget: "2026-10-23",
  /** Data controller named in the privacy notice. */
  controller: {
    name: "ARL Protocol",
  },
} as const;

/** The site page that publishes a repository file (see docs.ts). */
export const repoDoc = (path: string): `/${string}` => docPathFor(path);

/** Pages outside the Core. */
export const SITE_PAGES = [
  "/whitelist",
  "/buy",
  "/faq",
  "/docs",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
] as const;

/** Social preview image (app/opengraph-image.png). Pages that set `openGraph` repeat it,
 * because a page-level `openGraph` object replaces the inherited one. */
export const OG_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "ARL · 21,000,000 ARL maximum supply",
} as const;

export const TOKEN_DISCLAIMER =
  "The only official ARL contract on Base Mainnet is 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4. Tokens can lose all their value; nothing here is an offer, investment advice or a promise of price or listing.";
