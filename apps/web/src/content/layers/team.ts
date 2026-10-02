import { ALLOCATIONS } from "../../../../../packages/tokenomics/src/index.ts";
import { TEAM, type TeamProfile } from "../team/registry.ts";
import { SITE } from "../site.ts";
import type { Card, Fact, Layer, Section } from "../types.ts";

// Maps the team registry to Core cards. This is where the publishing rule is
// applied, so no component can show an unverified claim by accident.

const team = ALLOCATIONS.find((a) => a.id === "team");
if (!team || team.release.kind !== "program") {
  throw new Error("Team allocation is missing from packages/tokenomics");
}
const teamVesting = team.release.description;

export const UNVERIFIED_NOTE =
  "This profile has not been independently verified. Education and career details are published only after verification.";

function profileCard(p: TeamProfile, index: number): Card {
  const verified = p.verificationStatus === "verified";
  const facts: Fact[] = [
    { label: "Role", value: p.role },
    { label: "Profile", value: verified ? "Verified" : "Not yet verified" },
  ];
  const sections: Section[] = p.expertise.length
    ? [{ heading: "Expertise", items: p.expertise }]
    : [];
  if (verified) {
    if (p.education.length) sections.push({ heading: "Education", items: p.education });
    if (p.career.length) sections.push({ heading: "Career", items: p.career });
  } else {
    sections.push({ heading: "Verification", body: UNVERIFIED_NOTE });
  }
  sections.push({ heading: "Team token vesting", body: teamVesting });

  return {
    id: p.id,
    title: p.name,
    shortDescription: p.role,
    weight: index === 0 ? "primary" : "secondary",
    person: {
      name: p.name,
      role: p.role,
      open: false,
      verificationStatus: p.verificationStatus,
      initials: p.initials,
    },
    detail: {
      summary: p.expertise.length ? `Focus: ${p.expertise.join(", ").toLowerCase()}.` : p.role,
      facts,
      sections,
    },
    ...(verified && p.links?.length ? { links: p.links } : {}),
  };
}

export const TEAM_GROWING_ID = "team-growing";

const growingCard: Card = {
  id: TEAM_GROWING_ID,
  title: "The team is growing",
  shortDescription: "New members are listed after verification",
  weight: "secondary",
  detail: {
    summary:
      "ARL is currently led by its founder. New team members are listed here only once they have joined, their identity, role and background have been verified, and they have agreed to be published.",
    sections: [
      {
        heading: "Publishing rule",
        body: "No profile, photo or credential is shown for anyone who has not been verified. Nobody from ARL will contact you first or ask for a payment or a seed phrase.",
      },
    ],
  },
};

export const OPEN_ROLES_ID = "open-roles";

// Roles ARL wants to fill. A role is a need, not a person: no names, employers or credentials.
export const OPEN_ROLES: readonly string[] = [
  "Blockchain protocol engineer: consensus, execution, transaction processing",
  "Security engineer: smart-contract security, threat modeling, incident response",
  "Cryptography and privacy engineer: zero-knowledge proofs, applied cryptography",
  "Distributed systems engineer: peer-to-peer networks, fault tolerance",
  "GPU and compute infrastructure engineer: GPU scheduling, distributed inference",
  "DeFi engineer: liquidity, settlement, financial smart contracts",
  "Developer platform engineer: SDKs, APIs, documentation",
  "Frontend engineer: design systems, wallet and Web3 interfaces",
  "Product and platform architect: API design, developer experience",
  "Site reliability engineer: observability, automation, operations",
  "Quality engineer: automated testing, fuzzing, release validation",
];

const openRolesCard: Card = {
  id: OPEN_ROLES_ID,
  title: "Open roles",
  shortDescription: "Engineering roles ARL is looking to fill",
  weight: "secondary",
  detail: {
    summary:
      "ARL is looking for engineers in the areas below. Whoever joins is listed on this page only after their identity, role and background have been verified and they have agreed to be published.",
    sections: [
      { heading: "Roles", items: OPEN_ROLES },
      {
        heading: "How to apply",
        body: `Write to ${SITE.email} with the role, a short introduction and links to your work. ARL never asks applicants for a payment, a private key or a seed phrase.`,
      },
    ],
  },
};

export const teamLayer: Layer = {
  id: "team",
  title: "Team",
  description: "The people building ARL. Only verified members are listed as the team grows.",
  cards: [...TEAM.map(profileCard), growingCard, openRolesCard],
};
