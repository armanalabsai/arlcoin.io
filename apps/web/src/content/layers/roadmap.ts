import type { Layer } from "../types.ts";

// Phases are listed in order without dates. A date appears only once it is
// decided.

export const roadmap: Layer = {
  id: "roadmap",
  title: "Roadmap",
  description: "Where ARL is today. Base Mainnet is targeted for 23 October 2026.",
  cards: [
    {
      id: "phase-0",
      title: "Phase 0 · Foundation",
      shortDescription: "Repository, licensing, standards",
      progress: "done",
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
      progress: "done",
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
      progress: "done",
      weight: "primary",
      metric: { kind: "static", value: "Review complete, findings closed" },
      detail: {
        summary:
          "Security review of the contracts and the deployment process. The multi-layer review was completed on 17 October 2026: tests, fuzzing, invariants, Slither and Aderyn, Halmos proofs, Mythril and a reproducible build, with every finding closed. A bug bounty paid in ARL is open.",
      },
    },
    {
      id: "testnet",
      title: "Testnet",
      shortDescription: "Public test deployment",
      progress: "done",
      weight: "tertiary",
      metric: { kind: "static", value: "Live on Base Sepolia" },
      detail: {
        summary:
          "Deployed on the Base Sepolia testnet on 4 October 2026: 12 Safes, the token, two vesting wallets and the treasury timelock, source-verified on Basescan, Blockscout and Sourcify. Testnet tokens have no value.",
      },
    },
    {
      id: "ecosystem",
      title: "Testnet Ecosystem",
      shortDescription: "Staking, jobs, anonymous polls and the app",
      progress: "active",
      weight: "tertiary",
      metric: { kind: "static", value: "Live on Base Sepolia" },
      detail: {
        summary:
          "Deployed on Base Sepolia on 11 October 2026 and source-verified on Basescan: the staking contract, the ERC-8183 jobs escrow, the zero-knowledge verifier and the anonymous-poll contract. The ARL app at arlcoin.io/app runs against them, with a testnet ARL faucet, a relayer for anonymous votes and x402 per-use payments to a demo AI service registered on ERC-8004. The testnet reward period starts once the Community & Staking Safe funds it. Testnet tokens have no value.",
      },
      links: [{ label: "Open the app (testnet)", href: "https://arlcoin.io/app/" }],
    },
    {
      id: "mainnet",
      title: "Mainnet",
      shortDescription: "Production deployment",
      progress: "active",
      weight: "tertiary",
      metric: { kind: "static", value: "Target 2026-10-23" },
      detail: {
        summary:
          "The production deployment of ARL on Base Mainnet, which is the TGE. Targeted for 23 October 2026; it is not deployed yet.",
      },
    },
    {
      id: "services",
      title: "AI Payments and Compute",
      shortDescription: "The first services on ARL",
      progress: "active",
      weight: "tertiary",
      metric: { kind: "static", value: "Testnet live" },
      detail: {
        summary:
          'The first services that settle in ARL: AI service payments and the compute marketplace. Per-use payments (x402 "upto"), job escrow (ERC-8183) and a reference compute provider run on the Base Sepolia testnet in the ARL app. They go to Base Mainnet with the TGE.',
      },
    },
  ],
};
