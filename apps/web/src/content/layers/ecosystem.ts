import { ALLOCATIONS } from "../../../../../packages/tokenomics/src/index.ts";
import { SITE, repoDoc } from "../site.ts";
import type { Layer } from "../types.ts";

// The open-source software ARL is built on, named because ARL depends on it.
// None of these projects is a partner, sponsor or endorser of ARL.

const grants = ALLOCATIONS.find((a) => a.id === "grants-bug-bounty");
if (!grants) throw new Error("Grants allocation is missing from packages/tokenomics");

export const ecosystem: Layer = {
  id: "ecosystem",
  title: "Ecosystem",
  description: "Open-source software ARL builds on, and builder programs. No partnerships.",
  cards: [
    {
      id: "repository",
      title: "Open Source",
      shortDescription: "Apache-2.0, public repository",
      weight: "primary",
      detail: {
        summary:
          "All ARL code, documentation and decisions are public. The code is licensed under Apache-2.0.",
      },
      links: [
        { label: "Repository", href: SITE.repository },
        { label: "Contributing", href: repoDoc("CONTRIBUTING.md") },
      ],
    },
    {
      id: "openzeppelin",
      title: "OpenZeppelin Contracts",
      shortDescription: "Contract library · MIT",
      weight: "secondary",
      detail: {
        summary:
          "ARL's token, vesting and timelock contracts build on OpenZeppelin Contracts v5.6.1, used without modification under the MIT license.",
      },
    },
    {
      id: "foundry",
      title: "Foundry",
      shortDescription: "Build and test toolchain",
      weight: "secondary",
      detail: {
        summary:
          "Contracts are compiled, tested and rehearsed with Foundry. The toolchain version is pinned and verified in CI.",
      },
    },
    {
      id: "safe",
      title: "Safe",
      shortDescription: "Multisig custody software",
      status: "PLANNED",
      weight: "secondary",
      detail: {
        summary:
          "Treasury and multisig-held allocations are planned to be held by Safe multisig accounts. ARL uses Safe as deployed software; there is no relationship with the Safe project.",
      },
    },
    {
      id: "grants",
      title: "Grants / Bug Bounty",
      shortDescription: "Program not launched",
      status: "PLANNED",
      weight: "tertiary",
      metric: {
        kind: "static",
        value: grants.amount.toLocaleString("en-US"),
        unit: "ARL",
      },
      detail: {
        summary:
          "An allocation for builder grants and security bug bounties. The program, its scope and its payout table have not been published.",
      },
    },
    {
      id: "documentation",
      title: "Documentation",
      shortDescription: "Architecture, tokenomics, security",
      weight: "tertiary",
      detail: { summary: "Design documents for every part of ARL, kept with the code." },
      links: [
        { label: "Architecture", href: repoDoc("docs/architecture.md") },
        { label: "Tokenomics", href: repoDoc("docs/tokenomics.md") },
        { label: "Deployment", href: repoDoc("docs/deployment.md") },
      ],
    },
  ],
};
