import type { Layer } from "../types.ts";

// Phases are listed in order without dates. A date appears only once it is
// decided.

export const roadmap: Layer = {
  id: "roadmap",
  title: "Roadmap",
  description: "Where ARL is today. No dates are set for future phases.",
  cards: [
    {
      id: "phase-0",
      title: "Phase 0 · Foundation",
      shortDescription: "Repository, licensing, standards",
      weight: "secondary",
      metric: { kind: "static", value: "Complete" },
      detail: {
        summary:
          "Repository structure, Apache-2.0 licensing, CI, the content standard and the chain evaluation.",
      },
    },
    {
      id: "phase-1",
      title: "Phase 1 · Token Contracts",
      shortDescription: "Token, vesting and treasury",
      weight: "secondary",
      metric: { kind: "static", value: "Complete" },
      detail: {
        summary:
          "The ARL token, vesting wallets and the treasury timelock, with tests. The contracts are written and tested and have not been deployed.",
      },
    },
    {
      id: "phase-2",
      title: "Phase 2 · Security Review",
      shortDescription: "Review and remediation",
      weight: "primary",
      metric: { kind: "static", value: "In progress" },
      detail: {
        summary:
          "Security review of the contracts and the deployment process. The internal review and the deployment tooling are complete; an independent external audit is still to be done before mainnet.",
      },
    },
    {
      id: "testnet",
      title: "Testnet",
      shortDescription: "Public test deployment",
      weight: "tertiary",
      metric: { kind: "static", value: "Not started" },
      detail: {
        summary:
          "A deployment to a public test network. It requires a completed security review and a selected chain.",
      },
    },
    {
      id: "mainnet",
      title: "Mainnet",
      shortDescription: "Production deployment",
      weight: "tertiary",
      metric: { kind: "static", value: "Not started" },
      detail: { summary: "The production deployment of ARL. No date is set." },
    },
    {
      id: "services",
      title: "AI Payments and Compute",
      shortDescription: "The first services on ARL",
      weight: "tertiary",
      metric: { kind: "static", value: "Not started" },
      detail: {
        summary:
          "The first services that settle in ARL: AI service payments and the compute marketplace.",
      },
    },
  ],
};
