import type { Layer } from "../types.ts";

// Phases are listed in order without dates. A date appears only once it is
// decided.

export const roadmap: Layer = {
  id: "roadmap",
  title: "Roadmap",
  description: "Live on Base Mainnet: token, verified jobs and compute payments.",
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
          "The ARL token, vesting wallets and the treasury timelock, with unit, fuzz and invariant tests.",
      },
    },
    {
      id: "phase-2",
      title: "Phase 2 · Security Audit",
      shortDescription: "Audit and remediation",
      progress: "done",
      weight: "primary",
      metric: { kind: "static", value: "Audit complete, findings closed" },
      detail: {
        summary:
          "Security audit of the contracts and the deployment process. The multi-layer internal audit was completed on 17 October 2026: tests, fuzzing, invariants, Slither and Aderyn, Halmos proofs, Mythril and a reproducible build, with every finding closed. A bug bounty paid in ARL is open.",
      },
    },
    {
      id: "mainnet",
      title: "Mainnet",
      shortDescription: "Production deployment",
      progress: "done",
      weight: "tertiary",
      metric: { kind: "static", value: "Live 2026-10-24" },
      detail: {
        summary:
          "ARL was deployed on Base Mainnet on 24 October 2026: the token, two vesting wallets and the treasury timelock, source-verified on Basescan, with twelve allocation Safes. The official Uniswap v3 pools opened with 5,000,000 ARL from 0.20 USD per ARL.",
      },
      links: [
        {
          label: "ARL on Basescan",
          href: "https://basescan.org/token/0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4",
        },
      ],
    },
    {
      id: "verified-jobs",
      title: "Verified Jobs",
      shortDescription: "Escrowed AI jobs checked by staked validators",
      progress: "done",
      weight: "tertiary",
      metric: { kind: "static", value: "Live on Base Mainnet" },
      detail: {
        summary:
          "ERC-8183 job escrows paid in ARL or USDC, with a verified evaluator: a committee of staked ARL validators votes on each delivery, a challenge window follows, and a 2-of-3 arbiter Safe rules on disputed jobs only. Evaluator v4, with approvals counted per delivery and settlement after the deadline, went live on 12 November 2026. The ARL app at arlcoin.io/app runs against these contracts.",
      },
      links: [{ label: "Open the app", href: "https://arlcoin.io/app/verified/" }],
    },
    {
      id: "services",
      title: "Compute, Staking and AI Payments",
      shortDescription: "The next services on ARL",
      progress: "active",
      weight: "tertiary",
      metric: { kind: "static", value: "Rolling out on Base Mainnet" },
      detail: {
        summary:
          'The compute payment contract and the staking contract were deployed on Base Mainnet on 12 November 2026. Staking runs 180-day reward periods funded by the Community & Staking Safe and opens when the first period is funded. Per-use AI payments (x402 "upto"), the provider marketplace and anonymous polls follow, each after its own deployment and verification.',
      },
    },
  ],
};
