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
          "The ARL token, vesting wallets and the treasury timelock, with tests. Written, tested and deployed on the Base Sepolia testnet.",
      },
    },
    {
      id: "phase-2",
      title: "Phase 2 · Security Review",
      shortDescription: "Review and remediation",
      weight: "primary",
      metric: { kind: "static", value: "Internal review complete" },
      detail: {
        summary:
          "Security review of the contracts and the deployment process. The internal review is complete: tests, fuzzing, invariants, Slither with no findings, Halmos proofs and a reproducible build. No independent external audit has been performed; a bug bounty paid in ARL opens with the public test period.",
      },
    },
    {
      id: "testnet",
      title: "Testnet",
      shortDescription: "Public test deployment",
      weight: "tertiary",
      metric: { kind: "static", value: "Live on Base Sepolia" },
      detail: {
        summary:
          "Deployed on the Base Sepolia testnet on 4 October 2026: 12 Safes, the token, two vesting wallets and the treasury timelock, source-verified on Basescan, Blockscout and Sourcify. Testnet tokens have no value.",
      },
    },
    {
      id: "mainnet",
      title: "Mainnet",
      shortDescription: "Production deployment",
      weight: "tertiary",
      metric: { kind: "static", value: "Target 2026-12-01" },
      detail: {
        summary:
          "The production deployment of ARL on Base Mainnet, which is the TGE. Targeted for 1 December 2026; it is not deployed yet.",
      },
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
