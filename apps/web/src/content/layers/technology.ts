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
  description: "What ARL is for. Live on Base Sepolia; not on Base Mainnet yet.",
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
              "Payment integration on the open x402 protocol (upto scheme, Permit2), tested against the deployed contracts on a Base Sepolia fork. Not running on any network",
              "Settlement rules: one settlement per authorization, never above the signed ceiling, Base Sepolia only",
              "Facilitator service on the standard x402 facilitator API, with its settlement record kept on disk. Tested on a Base Sepolia fork, not running anywhere",
            ],
          },
          {
            heading: "Not yet built",
            items: [
              "No facilitator is running: running one needs an operator with a funded settlement account",
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
              "Provider registration and capacity listing in the ARL app: GPU model and count, GPU memory, vCPUs, memory and the longest job, priced per GPU or CPU second. Tested on a local chain",
              "Per-second metering settled in ARL over x402 upto: seconds rounded up, never above the signed ceiling",
              "Escrowed jobs with a deadline and refunds (ERC-8183) and ratings from paid jobs (ERC-8004)",
              "Reference provider software: runs the provider's own jobs for the paid time, bills the seconds used and settles them over x402. Tested locally, not running anywhere",
            ],
          },
          {
            heading: "Not yet built",
            items: [
              "Capacity is the provider's own statement; nothing on-chain checks the hardware",
              "One payment covers a run of up to 9 minutes; longer jobs go through escrowed jobs, and streaming payment is not built",
              "No provider has joined and nothing runs on a public network",
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
              "Anonymous polls on the Semaphore protocol, with proofs written in Noir (UltraHonk) and generated in the browser. Tested on a local chain",
            ],
          },
          {
            heading: "Not yet built",
            items: [
              "Private payments and verifiable computation are research topics; no circuits exist for them",
              "Not deployed on any public network",
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
              "Staking contract: stake ARL, earn ARL from a funded pool over fixed periods. Adapted from the Synthetix staking rewards contract (MIT). No owner, minting or upgrade; one funding role, the Community & Staking holder, which cannot touch staked tokens. Written and tested, not deployed",
            ],
          },
          {
            heading: "Not yet built",
            items: [
              "Reward amounts and period lengths are not decided",
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
          "The network that connects AI services, compute providers and users, with ARL as the unit of settlement. It uses open standards instead of new registries: ERC-8004 for services and ratings, ERC-8183 for escrowed jobs, x402 for payments. The selected chain is Base: Base Sepolia for testing, Base Mainnet for production.",
        sections: [
          {
            heading: "Built",
            items: [
              "ARL app screens to register, list, pay, hire and rate services, against the canonical ERC-8004 registry code. Tested on a local chain",
            ],
          },
          {
            heading: "Not yet built",
            items: ["Nothing is deployed on Base Mainnet", "No hosted app"],
          },
        ],
      },
      links: [
        { label: "App design", href: repoDoc("docs/app.md") },
        { label: "Chain evaluation", href: repoDoc("docs/chain-evaluation.md") },
      ],
    },
    {
      id: "token-contracts",
      title: "Token Contracts",
      shortDescription: "Tested; live on Base Sepolia testnet.",
      status: "IN DEVELOPMENT",
      weight: "tertiary",
      detail: {
        summary:
          "The token, vesting, treasury, launch claim and staking contracts are written in Solidity 0.8.36 on OpenZeppelin Contracts v5.6.1 and are under security review. The token, vesting and treasury contracts are deployed and source-verified on Base Sepolia (testnet); nothing is on Base Mainnet.",
        facts: [
          { label: "Language", value: "Solidity 0.8.36", mono: true },
          { label: "Library", value: "OpenZeppelin Contracts v5.6.1" },
          { label: "Toolchain", value: "Foundry" },
          { label: "Deployment", value: "Base Sepolia testnet; Base Mainnet not yet" },
        ],
      },
      links: [
        { label: "Architecture", href: repoDoc("docs/architecture.md") },
        { label: "Documents", href: "/docs" },
      ],
    },
  ],
};
