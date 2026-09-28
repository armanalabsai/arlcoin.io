// Site-wide constants. The domain is configuration, not a claim about content.

export const SITE = {
  name: "ARL",
  url: "https://arlcoin.io",
  description:
    "ARL is the native utility token planned for decentralized AI and compute services. 21,000,000 ARL maximum supply. Not yet deployed.",
  /** Short line under the Core on the overview. */
  tagline: "The native utility token planned for AI and compute services. Not yet deployed.",
  repository: "https://github.com/gokturkalazdaghan-dot/ARLCOIN",
  /** Public contact address of the team. */
  email: "armanalabsai@gmail.com",
} as const;

export const repoDoc = (path: string): `https://${string}` =>
  `https://github.com/gokturkalazdaghan-dot/ARLCOIN/blob/main/${path}`;

/** Pages outside the Core. */
export const SITE_PAGES = ["/whitelist", "/contact", "/privacy"] as const;

export const NOT_DEPLOYED = "Not yet deployed";

/** Social preview image (app/opengraph-image.png). Pages that set `openGraph` repeat it,
 * because a page-level `openGraph` object replaces the inherited one. */
export const OG_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "ARL · 21,000,000 ARL maximum supply",
} as const;

export const TOKEN_DISCLAIMER =
  "ARL is not deployed. No contract exists on any network, nothing is for sale, and nothing here is an offer, investment advice or a promise of listing.";
