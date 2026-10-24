import { docPathFor } from "./docs.ts";

// Site-wide constants. The domain is configuration, not a claim about content.

export const SITE = {
  name: "ARL",
  url: "https://arlcoin.io",
  description:
    "ARL Protocol: the utility token for AI and compute payments on Base. 21,000,000 ARL fixed supply, no mint or upgrade. Base Mainnet launch 23 October 2026.",
  /** Short line under the Core on the overview. */
  tagline: "The utility token for AI and compute services, live on Base Sepolia.",
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
   * Base Mainnet deployment. `token` stays null until the token is deployed and verified; the
   * "Add ARL to your wallet" button and the token list appear only once it is set.
   */
  mainnet: {
    chain: "Base",
    token: null as string | null,
  },
  /** Target date of the Base Mainnet token deployment (the TGE). */
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
  "ARL is deployed on the Base Sepolia testnet only; testnet tokens have no value. No ARL contract exists on Base Mainnet, nothing is for sale, and nothing here is an offer, investment advice or a promise of listing.";
