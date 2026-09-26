import { ALLOCATIONS } from "../../../../../packages/tokenomics/src/index.ts";
import { TEAM, type TeamProfile } from "../team/registry.ts";
import type { Card, Fact, Layer, Section } from "../types.ts";

// Maps the team registry to Core cards. This is where the publishing rule is
// applied, so no component can show an unverified claim by accident.

const team = ALLOCATIONS.find((a) => a.id === "team");
if (!team || team.release.kind !== "cliff-linear") {
  throw new Error("Team allocation is missing from packages/tokenomics");
}
const teamVesting = `${team.release.cliffMonths}-month cliff, then ${team.release.vestingMonths}-month linear vesting from each member's grant date`;

export const UNVERIFIED_NOTE =
  "This profile has not been independently verified. Education and career details are published only after verification.";

function profileCard(p: TeamProfile, index: number): Card {
  const verified = p.verificationStatus === "verified";
  const facts: Fact[] = [
    { label: "Role", value: p.role },
    { label: "Profile", value: verified ? "Verified" : "Not yet verified" },
  ];
  const sections: Section[] = [{ heading: "Expertise", items: p.expertise }];
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
    detail: { summary: `Focus: ${p.expertise.join(", ").toLowerCase()}.`, facts, sections },
    ...(verified && p.links?.length ? { links: p.links } : {}),
  };
}

export const teamLayer: Layer = {
  id: "team",
  title: "Team",
  description: "The people building ARL. Profiles are marked until verified.",
  cards: TEAM.map(profileCard),
};
