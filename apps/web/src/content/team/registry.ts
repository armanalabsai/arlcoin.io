import type { ExternalLink, VerificationStatus } from "../types.ts";

// ARL team registry: the single source for team profiles.
//
// Publishing rule: education and career entries are claims about real
// institutions and employers. They are rendered only for profiles whose
// verificationStatus is "verified". For every other profile the site shows
// the name, the role and neutral expertise, and states that the profile is
// not verified. Portraits and links are rendered only when verified and only
// from a real source; none is invented.
//
// Nationality and ethnicity are deliberately not recorded: they add nothing
// to a team profile and are not shown on the site.
//
// Only people who exist and agree to be published are listed. A new member is
// added here once their identity, role and background are verified.

export interface TeamProfile {
  /** URL segment. */
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly initials: string;
  readonly verificationStatus: VerificationStatus;
  /** Birth year as provided. Recorded, never displayed. */
  readonly birthYear?: number;
  /** Neutral areas of expertise, without institution names. Safe to display. */
  readonly expertise: readonly string[];
  /** Claims about institutions. Displayed only when verified. */
  readonly education: readonly string[];
  /** Claims about employers and projects. Displayed only when verified. */
  readonly career: readonly string[];
  /** Path under /public to a consented photo. Only for verified profiles. */
  readonly portrait?: string;
  /** Real, checked URLs only. Displayed only when verified. */
  readonly links?: readonly ExternalLink[];
}

export const TEAM: readonly TeamProfile[] = [
  {
    id: "foundark",
    name: "FoundArk",
    role: "CEO — AI Founder",
    initials: "FA",
    verificationStatus: "unverified",
    birthYear: 2024,
    expertise: ["Strategic direction", "Autonomous networks", "Decentralized AI systems"],
    education: ["AGI Core Systems Laboratory"],
    career: [
      "Strategic decision-maker and founding leader in autonomous networks and decentralized AI systems",
    ],
  },
];
