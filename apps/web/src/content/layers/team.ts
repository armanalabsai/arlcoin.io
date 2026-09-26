import { ALLOCATIONS } from "../../../../../packages/tokenomics/src/index.ts";
import { SITE } from "../site.ts";
import type { Card, Layer } from "../types.ts";

// Only the founder is a named person. Every other seat is an open role and is
// labelled as one: no invented names, biographies or photos.

const team = ALLOCATIONS.find((a) => a.id === "team");
if (!team || team.release.kind !== "cliff-linear") {
  throw new Error("Team allocation is missing from packages/tokenomics");
}
const teamVesting = `${team.release.cliffMonths}-month cliff, then ${team.release.vestingMonths}-month linear vesting from each member's grant date`;

interface OpenRole {
  id: string;
  role: string;
  focus: readonly string[];
}

const OPEN_ROLES: readonly OpenRole[] = [
  {
    id: "blockchain-engineer",
    role: "Blockchain Engineer",
    focus: ["Solidity and the EVM", "Token, vesting and treasury contracts", "Deployment tooling"],
  },
  {
    id: "security-engineer",
    role: "Security Engineer",
    focus: ["Smart contract review", "Threat modelling", "Incident response"],
  },
  {
    id: "ai-engineer",
    role: "AI Engineer",
    focus: ["AI service integration", "Usage metering", "Settlement in ARL"],
  },
  {
    id: "compute-engineer",
    role: "Compute Engineer",
    focus: ["GPU and CPU scheduling", "Provider onboarding", "Job metering"],
  },
  {
    id: "zk-engineer",
    role: "ZK Engineer",
    focus: ["Zero-knowledge proof systems", "Circuit design", "Verification contracts"],
  },
  {
    id: "defi-engineer",
    role: "DeFi Engineer",
    focus: ["Staking design", "Liquidity operations", "Protocol economics"],
  },
];

const openRoleCard = (r: OpenRole): Card => ({
  id: r.id,
  title: r.role,
  shortDescription: r.focus.slice(0, 2).join(" · "),
  weight: "tertiary",
  person: { name: null, role: r.role, open: true },
  detail: {
    summary: "This seat is open. No one has been appointed to it.",
    facts: [{ label: "Team token vesting", value: teamVesting }],
    sections: [{ heading: "Focus", items: r.focus }],
  },
  links: [{ label: "Repository", href: SITE.repository }],
});

export const teamLayer: Layer = {
  id: "team",
  title: "Team",
  description: "The founder and the open core roles.",
  cards: [
    {
      id: "founder",
      title: "Alaz Daghan Gokturk",
      shortDescription: "Founder / Project Lead",
      weight: "primary",
      person: { name: "Alaz Daghan Gokturk", role: "Founder / Project Lead", open: false },
      detail: {
        summary: "Founder and project lead of ARL.",
        sections: [
          {
            heading: "Responsibilities",
            items: [
              "Product and protocol direction",
              "Tokenomics and allocation decisions",
              "Building the core team",
            ],
          },
        ],
      },
      links: [{ label: "Repository", href: SITE.repository }],
    },
    ...OPEN_ROLES.map(openRoleCard),
  ],
};
