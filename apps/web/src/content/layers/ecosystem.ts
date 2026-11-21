import { ALLOCATIONS } from "../../../../../packages/tokenomics/src/index.ts";
import { repoDoc } from "../site.ts";
import type { Layer } from "../types.ts";

// The open-source software ARL is built on, named because ARL depends on it.
// None of these projects is a partner, sponsor or endorser of ARL.

const grants = ALLOCATIONS.find((a) => a.id === "grants-bug-bounty");
if (!grants) throw new Error("Grants allocation is missing from packages/tokenomics");

export const ecosystem: Layer = {
  id: "ecosystem",
  title: "Ecosystem",
  description: "The open-source software ARL Protocol builds on, and the programs for builders.",
  cards: [
    {
      id: "repository",
      title: "Open Source",
      shortDescription: "Apache-2.0 and MIT licensed",
      weight: "primary",
      detail: {
        summary:
          "All ARL code, documentation and decisions are public. The protocol repository is licensed under Apache-2.0; the n8n node (n8n-nodes-arl) is licensed under MIT.",
      },
      links: [
        { label: "Documents", href: "/docs" },
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
      status: "LIVE",
      weight: "secondary",
      detail: {
        summary:
          "The treasury and the allocations are held by Safe multisig accounts on Base Mainnet (twelve Safes, 2-of-3 for the role Safes). ARL uses Safe as deployed software; there is no relationship with the Safe project.",
      },
    },
    {
      id: "grants",
      title: "Grants / Bug Bounty",
      shortDescription: "Bug bounty open, paid in ARL",
      status: "LIVE",
      weight: "tertiary",
      metric: {
        kind: "static",
        value: grants.amount.toLocaleString("en-US"),
        unit: "ARL",
      },
      detail: {
        summary:
          "An allocation for builder grants and security bug bounties. The bug bounty is open, with its scope and payout table published in docs/bug-bounty.md; rewards are paid in ARL from the Grants & Bug Bounty Safe. A builder grants program has not been published yet.",
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
        { label: "Mainnet services", href: repoDoc("docs/mainnet-services.md") },
      ],
    },
  ],
};
