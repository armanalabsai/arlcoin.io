import { ALLOCATIONS } from "../../../../../packages/tokenomics/src/index.ts";
import { SITE, repoDoc } from "../site.ts";
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
  description: "What ARL is for. Only the token contracts exist today.",
  cards: [
    {
      id: "ai-payments",
      title: "AI Payments",
      shortDescription: "AI services settle usage in ARL",
      status: "PLANNED",
      weight: "primary",
      detail: {
        summary:
          "AI services on the ARL network will be paid for in ARL, per use: consumers pay for what they use and providers are settled in ARL.",
        sections: [
          {
            heading: "Planned scope",
            items: [
              "Usage-based settlement between service consumers and providers",
              "Metered requests, priced and settled in ARL",
              "Third-party AI models accessed as a regular customer through their public APIs, under each provider's standard terms",
            ],
          },
          {
            heading: "Not yet built",
            items: [
              "No payment contract or service exists",
              "No agreement with any AI provider exists",
            ],
          },
        ],
      },
    },
    {
      id: "compute",
      title: "GPU / CPU Compute",
      shortDescription: "Compute capacity, paid in ARL",
      status: "PLANNED",
      weight: "primary",
      detail: {
        summary:
          "Providers will offer GPU and CPU capacity; consumers will run jobs and pay in ARL. Early provider participation is eligible for the Early Users program.",
        sections: [
          {
            heading: "Planned scope",
            items: [
              "Provider registration and capacity listing",
              "Metered jobs, settled in ARL",
              "Reward eligibility for early providers and consumers",
            ],
          },
          { heading: "Not yet built", items: ["No marketplace or provider software exists"] },
        ],
      },
    },
    {
      id: "zk-privacy",
      title: "ZK Privacy",
      shortDescription: "Verify without revealing inputs",
      status: "PLANNED",
      weight: "secondary",
      detail: {
        summary:
          "Research track: use zero-knowledge proofs so that a computation or a payment can be verified without revealing its inputs.",
        sections: [
          {
            heading: "Not yet built",
            items: ["No proof system has been selected", "No circuits exist"],
          },
        ],
      },
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
              "Staking contract: stake ARL, earn ARL from a funded pool over fixed periods. Adapted from the Synthetix staking rewards contract (MIT); no owner and no minting. Written and tested, not deployed",
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
      status: "PLANNED",
      weight: "secondary",
      detail: {
        summary:
          "The network that connects AI services, compute providers and users, with ARL as the unit of settlement. The selected chain is Base: Base Sepolia for testing, Base Mainnet for production. Nothing is deployed yet.",
      },
      links: [{ label: "Chain evaluation", href: repoDoc("docs/chain-evaluation.md") }],
    },
    {
      id: "token-contracts",
      title: "Token Contracts",
      shortDescription: "Written and tested. Not deployed.",
      status: "IN DEVELOPMENT",
      weight: "tertiary",
      detail: {
        summary:
          "The token, vesting, treasury, launch claim and staking contracts are written in Solidity 0.8.36 on OpenZeppelin Contracts v5.6.1 and are under security review. They are not deployed.",
        facts: [
          { label: "Language", value: "Solidity 0.8.36", mono: true },
          { label: "Library", value: "OpenZeppelin Contracts v5.6.1" },
          { label: "Toolchain", value: "Foundry" },
          { label: "Deployment", value: "Not yet deployed" },
        ],
      },
      links: [
        { label: "Architecture", href: repoDoc("docs/architecture.md") },
        { label: "Repository", href: SITE.repository },
      ],
    },
  ],
};
