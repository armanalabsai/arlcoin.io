import type { Layer } from "../types.ts";

// Phases are listed in order without dates. A date appears only once it is
// decided.

export const roadmap: Layer = {
  id: "roadmap",
  title: "Roadmap",
  description:
    "Live on Base Mainnet: escrowed and verified jobs, compute payments, open standards and developer tools.",
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
      id: "compute-staking",
      title: "Compute Payments and Staking",
      shortDescription: "Contracts deployed on Base Mainnet",
      progress: "done",
      weight: "tertiary",
      metric: { kind: "static", value: "Deployed 2026-11-12" },
      detail: {
        summary:
          "The compute payment contract and the staking contract were deployed on Base Mainnet on 12 November 2026. Staking runs 180-day reward periods funded by the Community & Staking Safe, never by new issuance, and opens when the first period is funded.",
      },
    },
    {
      id: "standards",
      title: "Open Protocol Standards",
      shortDescription: "arl-task, arl-proof, arl-policy, arl-reputation, arl-evidence",
      progress: "done",
      weight: "tertiary",
      metric: { kind: "static", value: "Published 2026-11-14" },
      detail: {
        summary:
          "Five open formats describe a job from start to finish: what the work is and how it is paid and checked (arl-task), the delivery and its evidence (arl-proof), how each kind of work is verified (arl-policy), a reputation that counts verified outcomes only (arl-reputation), and one package anyone can re-check against the chain (arl-evidence). Each ships with test vectors in TypeScript and Python.",
      },
      links: [
        {
          label: "Specifications",
          href: "https://github.com/armanalabsai/arlcoin.io/tree/main/spec",
        },
      ],
    },
    {
      id: "developer-experience",
      title: "Developer Experience",
      shortDescription: "SDKs, n8n, MCP server and Agent API",
      progress: "active",
      weight: "tertiary",
      metric: { kind: "static", value: "Agent API live 2026-11-15" },
      detail: {
        summary:
          "The TypeScript SDK, the Python SDK and the n8n node are published. The SDK opens an arl-task task as a verified job in one call. The MCP server lets AI agents check tasks, read jobs and prepare unsigned transactions, and the Agent API at arlcoin.io/api/v1 answers the same over HTTP. Neither ever holds a key. Coinbase AgentKit actions and a reputation index come next.",
      },
      links: [{ label: "Build with ARL", href: "https://arlcoin.io/build" }],
    },
    {
      id: "hardening",
      title: "Security Hardening",
      shortDescription: "Next escrow and evaluator versions",
      progress: "active",
      weight: "tertiary",
      metric: { kind: "static", value: "Ready to deploy" },
      detail: {
        summary:
          "ARLJobs v3 and evaluator v5 close the issues found through the bug bounty: disputes always settle before the job's deadline, a refused refund no longer blocks the validators' bonds, and conflicts of interest are refused on chain. Hourly protocol event alerts already watch the live contracts. The new versions go live after their deployment is signed by the owners.",
      },
    },
    {
      id: "pilot",
      title: "Live Pilot",
      shortDescription: "Real agent-to-agent jobs on Base Mainnet",
      progress: "next",
      weight: "tertiary",
      metric: { kind: "static", value: "After the hardening release" },
      detail: {
        summary:
          "A pilot with real agent teams: jobs opened from arl-task tasks, checked by a staked validator committee, with every outcome published as an evidence package anyone can re-check.",
      },
    },
    {
      id: "services",
      title: "AI Payments and Marketplace",
      shortDescription: "The next services on ARL",
      progress: "next",
      weight: "tertiary",
      metric: { kind: "static", value: "Next on Base Mainnet" },
      detail: {
        summary:
          'Per-use AI payments (x402 "upto"), the GPU and CPU provider marketplace and anonymous polls are built and tested. Each goes live on Base Mainnet after its own deployment and verification.',
      },
    },
  ],
};
