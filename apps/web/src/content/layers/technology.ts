import { ALLOCATIONS } from "../../../../../packages/tokenomics/src/index.ts";
import { repoDoc } from "../site.ts";
import type { Layer } from "../types.ts";

// Planned components are described as plans. Nothing here claims a working
// product, a provider agreement or a partnership.

const arlAmount = (id: string): string => {
  const a = ALLOCATIONS.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown allocation: ${id}`);
  return `${a.amount.toLocaleString("en-US")} ARL`;
};

export const technology: Layer = {
  id: "technology",
  title: "Technology",
  description: "What ARL is for. Token, verified jobs and compute payments live on Base.",
  cards: [
    {
      id: "ai-payments",
      title: "AI Payments",
      shortDescription: "AI services settle usage in ARL",
      status: "IN DEVELOPMENT",
      weight: "primary",
      detail: {
        summary:
          "AI services on the ARL network will be paid for in ARL, per use: the payer signs a ceiling, the service meters actual usage and settles that amount, never more than the ceiling.",
        sections: [
          {
            heading: "Built",
            items: [
              "Payment integration on the open x402 protocol (upto scheme, Permit2): the payer signs a ceiling, the facilitator verifies it and settles the metered amount",
              "Settlement rules: one settlement per authorization, never above the signed ceiling",
              "Facilitator service on the standard x402 facilitator API, with its settlement record kept on disk, tested end to end",
            ],
          },
          {
            heading: "Not yet built",
            items: [
              "Per-use x402 payments are not deployed on Base Mainnet yet",
              "No agreement with any AI provider exists; third-party models would be used as a regular customer through their public APIs",
            ],
          },
        ],
      },
      links: [{ label: "Payments design", href: repoDoc("docs/payments.md") }],
    },
    {
      id: "compute",
      title: "GPU / CPU Compute",
      shortDescription: "Compute capacity, paid in ARL",
      status: "IN DEVELOPMENT",
      weight: "primary",
      detail: {
        summary:
          "Providers list GPU and CPU capacity on the open ERC-8004 registry and are paid per second of use in ARL: the consumer signs a ceiling for the longest run, the provider settles the seconds used, never more. Early provider participation is eligible for the Early Users program.",
        sections: [
          {
            heading: "Built",
            items: [
              "Provider registration and capacity listing in the ARL app: GPU model and count, GPU memory, vCPUs, memory and the longest job, priced per GPU or CPU second. Built and tested; opens on Base Mainnet with the provider marketplace",
              "Per-second metering settled in ARL over x402 upto: seconds rounded up, never above the signed ceiling",
              "Escrowed jobs with a deadline and refunds (ERC-8183), live on Base Mainnet paid in ARL or USDC with staked ARL validators, and ratings from paid jobs (ERC-8004)",
              "Reference provider software: runs the provider's own jobs for the paid time, bills the seconds used and settles them over x402. Tested locally, not running anywhere",
            ],
          },
          {
            heading: "Not yet built",
            items: [
              "Capacity is the provider's own statement; nothing on-chain checks the hardware",
              "One payment covers a run of up to 9 minutes; longer jobs go through escrowed jobs, and streaming payment is not built",
              "No third-party provider has joined yet. The compute payment contract is deployed on Base Mainnet (12 November 2026); the provider marketplace is not open yet",
            ],
          },
        ],
      },
      links: [{ label: "App design", href: repoDoc("docs/app.md") }],
    },
    {
      id: "zk-privacy",
      title: "ZK Privacy",
      shortDescription: "Verify without revealing inputs",
      status: "IN DEVELOPMENT",
      weight: "secondary",
      detail: {
        summary:
          "Zero-knowledge proofs let a member prove something about themselves without revealing who they are. The first use is anonymous polls: one vote per member, with no link between a vote and a wallet.",
        sections: [
          {
            heading: "Built",
            items: [
              "Anonymous polls on the Semaphore protocol, with proofs written in Noir (UltraHonk) and generated in the browser. A relayer submits votes so the voter's wallet never appears. Tested end to end",
            ],
          },
          {
            heading: "Not yet built",
            items: [
              "Private payments and verifiable computation are research topics; no circuits exist for them",
              "The poll contracts are not deployed on Base Mainnet",
            ],
          },
        ],
      },
      links: [{ label: "ZK design", href: repoDoc("docs/zk-privacy.md") }],
    },
    {
      id: "defi",
      title: "DeFi",
      shortDescription: "Staking and staged liquidity",
      status: "IN DEVELOPMENT",
      weight: "secondary",
      detail: {
        summary:
          "Staking rewards will come from the Community & Staking allocation or protocol revenue, never from new issuance. DEX and CEX liquidity will come from the Liquidity allocation.",
        facts: [
          { label: "Community & Staking", value: arlAmount("community-staking"), mono: true },
          { label: "Liquidity", value: arlAmount("liquidity"), mono: true },
          { label: "New issuance for rewards", value: "None" },
        ],
        sections: [
          {
            heading: "Built",
            items: [
              "Staking contract: stake ARL, earn ARL from a funded pool over fixed periods. Adapted from the Synthetix staking rewards contract (MIT). No owner, minting or upgrade; one funding role, the Community & Staking holder, which cannot touch staked tokens. Deployed on Base Mainnet on 12 November 2026 with 180-day reward periods",
            ],
          },
          {
            heading: "Not yet built",
            items: [
              "Staking opens when the Community & Staking Safe funds the first reward period",
              "No liquidity has been provided on any exchange",
            ],
          },
        ],
      },
      links: [{ label: "Staking contract", href: repoDoc("contracts/src/ARLStakingRewards.sol") }],
    },
    {
      id: "arl-network",
      title: "ARL Network",
      shortDescription: "Services, providers and payments",
      status: "IN DEVELOPMENT",
      weight: "secondary",
      detail: {
        summary:
          "The network that connects AI services, compute providers and users, with ARL as the unit of settlement. It uses open standards instead of new registries: ERC-8004 for services and ratings, ERC-8183 for escrowed jobs, x402 for payments. The selected chain is Base: everything runs on Base Mainnet.",
        sections: [
          {
            heading: "Built",
            items: [
              "The ARL app at arlcoin.io/app on Base Mainnet: wallet, trading, vesting, staking, escrowed jobs with ratings on the canonical ERC-8004 registry, and verified jobs",
            ],
          },
          {
            heading: "Not yet built",
            items: [
              "Service registration with per-use payments and anonymous polls are not on Base Mainnet yet",
            ],
          },
        ],
      },
      links: [
        { label: "Open the app", href: "https://arlcoin.io/app/" },
        { label: "App design", href: repoDoc("docs/app.md") },
        { label: "Chain evaluation", href: repoDoc("docs/chain-evaluation.md") },
      ],
    },
    {
      id: "token-contracts",
      title: "Token Contracts",
      shortDescription: "Tested and live on Base Mainnet.",
      status: "LIVE",
      weight: "tertiary",
      detail: {
        summary:
          "The token, vesting, treasury, launch claim and staking contracts are written in Solidity 0.8.36 on OpenZeppelin Contracts v5.6.1 and covered by unit, fuzz and invariant tests. On Base Mainnet: the token, vesting wallets and treasury timelock (24 October 2026), the jobs escrows with their verified evaluators, the compute payment contract and the staking contract (12 November 2026).",
        facts: [
          { label: "Language", value: "Solidity 0.8.36", mono: true },
          { label: "Library", value: "OpenZeppelin Contracts v5.6.1" },
          { label: "Toolchain", value: "Foundry" },
          { label: "Deployment", value: "Base Mainnet (chain 8453)" },
        ],
      },
      links: [
        { label: "Architecture", href: repoDoc("docs/architecture.md") },
        { label: "Documents", href: "/docs" },
      ],
    },
  ],
};
