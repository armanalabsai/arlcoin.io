// Site-wide constants. The domain is configuration, not a claim about content.

export const SITE = {
  name: "ARL",
  url: "https://arlcoin.io",
  description:
    "ARL is the native utility token planned for decentralized AI and compute services. 21,000,000 ARL maximum supply. Not yet deployed.",
  /** Short line under the Core on the overview. */
  tagline: "The native utility token planned for AI and compute services. Not yet deployed.",
  repository: "https://github.com/gokturkalazdaghan-dot/ARLCOIN",
} as const;

export const repoDoc = (path: string): `https://${string}` =>
  `https://github.com/gokturkalazdaghan-dot/ARLCOIN/blob/main/${path}`;

export const NOT_DEPLOYED = "Not yet deployed";

export const TOKEN_DISCLAIMER =
  "ARL is not deployed. No contract exists on any network, nothing is for sale, and nothing here is an offer, investment advice or a promise of listing.";
