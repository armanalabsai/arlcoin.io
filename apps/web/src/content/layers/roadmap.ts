import type { Layer } from "../types.ts";

// Only work that is finished (done) or under way (active) is listed. Nothing that has not
// started appears here.

export const roadmap: Layer = {
  id: "roadmap",
  title: "Roadmap",
  description: "Live on Base Mainnet: verified jobs, payments, standards and tools.",
  cards: [
    {
      id: "phase-2",
      title: "Foundation and Audit",
      shortDescription: "Token contracts and internal audit",
      progress: "done",
      weight: "secondary",
      metric: { kind: "static", value: "Internal audit complete, findings closed" },
      detail: {
        summary:
          "Repository, Apache-2.0 licensing and CI; the ARL token, vesting wallets and treasury timelock with unit, fuzz and invariant tests; and a security audit of the contracts and the deployment process. The multi-layer internal audit was completed on 17 October 2026: tests, fuzzing, invariants, Slither and Aderyn, Halmos proofs, Mythril and a reproducible build, with every finding closed. A bug bounty paid in ARL is open.",
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
          "ERC-8183 job escrows paid in ARL or USDC, with a verified evaluator: a committee of staked ARL validators votes on each delivery, a challenge window follows, and a 2-of-3 arbiter Safe rules on disputed jobs only. Escrows v3 went live on 16 November 2026 and evaluator v7 on 19 November 2026: late finalization always settles, an unanswered dispute can be expired by anyone, and the agent is bound at committee approval so a rejection always reaches ERC-8004 reputation. The ARL app at arlcoin.io/app runs against these contracts. Validators are open: anyone can stake and run one, and since 21 November 2026 the first five independent validators earn 250 ARL a month for three months from December 2026, with at least 1,000 ARL staked.",
      },
      links: [
        { label: "Open the app", href: "https://arlcoin.io/app/verified/" },
        {
          label: "Run a validator",
          href: "https://github.com/armanalabsai/arlcoin.io/blob/main/docs/run-a-validator.md",
        },
      ],
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
          "The compute payment contract and the staking contract were deployed on Base Mainnet on 12 November 2026. Staking runs 180-day reward periods funded by the Community & Staking Safe, never by new issuance; the first period (300,000 ARL) runs since 16 November 2026.",
      },
    },
    {
      id: "standards",
      title: "Open Standards",
      shortDescription: "Five open formats for agent jobs",
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
      shortDescription: "SDKs, MCP server, Agent API, n8n node",
      progress: "active",
      weight: "tertiary",
      metric: { kind: "static", value: "On npm and PyPI" },
      detail: {
        summary:
          "The TypeScript SDK (arl-protocol-sdk) and the MCP server (arl-protocol-mcp) are on npm, the Python SDK (arl-protocol) is on PyPI, and the n8n node (n8n-nodes-arl, MIT) is on npm and in n8n's review. The SDK opens an arl-task task as a verified job in one call. The MCP server lets AI agents check tasks, read jobs and prepare unsigned transactions; the Agent API at arlcoin.io/api/v1 and the A2A agent card answer the same over HTTP. None of them ever holds a key. Since 21 November 2026 a service can be sold through a verified job with one wrapper (pay on proof, the x402 arl-escrow scheme), and the Agent API answers an agent's score, passport and badge, the trust graph of verified work and the audit trail of any job.",
      },
      links: [{ label: "Build with ARL", href: "https://arlcoin.io/build" }],
    },
    {
      id: "hardening",
      title: "Security Hardening",
      shortDescription: "Bug bounty fixes, evaluator v7 live",
      progress: "active",
      weight: "tertiary",
      metric: { kind: "static", value: "Evaluator v7 live 2026-11-19" },
      detail: {
        summary:
          "ARLJobs v3 and evaluator v5 went live on 16 November 2026 and close the issues found through the bug bounty: disputes always settle before the job's deadline, a refused refund no longer blocks the validators' bonds, and conflicts of interest are refused on chain. Hourly protocol event alerts watch the live contracts. Evaluator v6 went live on 19 November 2026 with further fixes from bounty reports: the arbiter cannot open a dispute it would rule on, late rejections still reach the ERC-8004 record, the provider must own the agent it is hired as, and rulings name the upheld deliverable. Evaluator v7 followed the same day: a rejection closed with release still reaches the record, and a job can only be configured with its provider named and with an agent that provider owns. The first verified job ran on v7 on 20 November 2026: three staked validators re-executed the work and approved it on chain. Hardening continues with every report.",
      },
    },
    {
      id: "trust-layer",
      title: "Trust Layer",
      shortDescription: "Scores, passports, audit trails, receipts",
      progress: "done",
      weight: "tertiary",
      metric: { kind: "static", value: "Live 2026-11-21" },
      detail: {
        summary:
          "Every verified job leaves a public record that anyone can read without a key or an account: an agent's score and passport, each job's audit trail, a portable receipt that can be recorded on the Ethereum Attestation Service, the validators and their stakes, and the graph of who paid whom. The Agent API serves them as JSON, the SDKs and the MCP server as functions and tools, and ARLscan in the app shows them in a browser. Every answer names the block it was read at.",
      },
      links: [
        {
          label: "Agent API reference",
          href: "https://github.com/armanalabsai/arlcoin.io/blob/main/docs/agent-api.md",
        },
      ],
    },
    {
      id: "first-services",
      title: "First Paid Services",
      shortDescription: "Pay-on-proof for services outside the team",
      progress: "active",
      weight: "tertiary",
      metric: { kind: "static", value: "In progress" },
      detail: {
        summary:
          "payOnProof lets an HTTP service ask for a payment that is held in escrow and released only after validators accept the result. The SDK function and a runnable example of a paid service and its caller are published. The work now is bringing the first services outside the team onto it.",
      },
      links: [
        {
          label: "Quickstart",
          href: "https://github.com/armanalabsai/arlcoin.io/blob/main/docs/quickstart.md",
        },
      ],
    },
  ],
};
