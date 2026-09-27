import {
  ALLOCATIONS,
  MAX_SUPPLY,
  MIN_TIMELOCK_HOURS,
  formatBasisPoints,
  shareOfSupply,
} from "../../../../../packages/tokenomics/src/index.ts";
import type { Allocation } from "../../../../../packages/tokenomics/src/index.ts";
import { NOT_DEPLOYED, TOKEN_DISCLAIMER, repoDoc } from "../site.ts";
import type { Fact, Layer } from "../types.ts";

// Every number on this layer comes from packages/tokenomics. Nothing that
// depends on a deployment is given a value: those cards stay "unavailable"
// until a real data source exists.

export const formatArl = (amount: number) => `${amount.toLocaleString("en-US")} ARL`;

const shares = new Map(shareOfSupply(ALLOCATIONS, MAX_SUPPLY).map((s) => [s.id, s.basisPoints]));

function allocation(id: string): Allocation {
  const found = ALLOCATIONS.find((a) => a.id === id);
  if (!found) throw new Error(`Unknown allocation: ${id}`);
  return found;
}

function share(id: string): string {
  const bp = shares.get(id);
  if (bp === undefined) throw new Error(`No share for allocation: ${id}`);
  return formatBasisPoints(bp);
}

const treasury = allocation("treasury");
const treasuryControls =
  treasury.release.kind === "custody" ? treasury.release.controls : undefined;
if (!treasuryControls) throw new Error("Treasury controls are missing from packages/tokenomics");

const vesting = ALLOCATIONS.filter((a) => a.release.kind === "vesting");

const allocationFacts: Fact[] = ALLOCATIONS.map((a) => ({
  label: a.name,
  value: `${formatArl(a.amount)} · ${share(a.id)}`,
  mono: true,
}));

export const token: Layer = {
  id: "token",
  title: "Token",
  description: `${formatArl(MAX_SUPPLY)} maximum supply. Values that depend on a deployment are marked as such.`,
  disclaimer: TOKEN_DISCLAIMER,
  cards: [
    {
      id: "max-supply",
      title: "Maximum Supply",
      shortDescription: "Fixed. Minted once at deployment.",
      status: "IN DEVELOPMENT",
      weight: "primary",
      metric: { kind: "static", value: MAX_SUPPLY.toLocaleString("en-US"), unit: "ARL" },
      detail: {
        summary:
          "The supply is fixed at 21,000,000 ARL. The full amount is minted once, when the token contract is deployed. The contract has no function that can mint more.",
        facts: [
          { label: "Maximum supply", value: formatArl(MAX_SUPPLY), mono: true },
          { label: "Minting after deployment", value: "None" },
          { label: "Owner or admin", value: "None" },
          { label: "Pause or upgrade", value: "None" },
        ],
      },
      links: [{ label: "Token design", href: repoDoc("docs/token-design.md") }],
    },
    {
      id: "allocation",
      title: "Allocation",
      shortDescription: `${ALLOCATIONS.length} allocations, the whole supply`,
      status: "IN DEVELOPMENT",
      weight: "primary",
      metric: { kind: "static", value: String(ALLOCATIONS.length), unit: "allocations" },
      detail: {
        summary:
          "The entire supply is assigned at deployment to eleven allocations, each held by its own vesting wallet, timelock or dedicated Safe. The Founder allocation of 2,100,000 ARL is held in two parts, 2,000,000 ARL fully unlocked at TGE with no vesting and 100,000 ARL reserved, whose treatment and custody are not decided. Amounts are exact and add up to 21,000,000 ARL; shares are rounded to two decimals.",
        facts: allocationFacts,
      },
      links: [{ label: "Tokenomics", href: repoDoc("docs/tokenomics.md") }],
    },
    {
      id: "circulating-supply",
      title: "Circulating Supply",
      shortDescription: "No ARL exists yet.",
      status: "PLANNED",
      weight: "secondary",
      metric: { kind: "unavailable", label: NOT_DEPLOYED, source: "chain.circulatingSupply" },
      detail: {
        summary:
          "No ARL exists yet, so nothing circulates. Allocated supply is not circulating supply. After deployment, circulating supply will be computed from on-chain state and published together with its methodology: what counts as locked, vested, released and held in custody.",
      },
    },
    {
      id: "treasury",
      title: "Treasury",
      shortDescription: `Safe ${treasuryControls.threshold}-of-${treasuryControls.signers}, ${treasuryControls.minDelayHours}-hour timelock`,
      status: "IN DEVELOPMENT",
      weight: "secondary",
      metric: { kind: "static", value: treasury.amount.toLocaleString("en-US"), unit: "ARL" },
      detail: {
        summary: `The treasury is held by a timelock contract controlled by a Safe multisig. Every treasury transaction waits at least ${MIN_TIMELOCK_HOURS} hours between approval and execution, and a separate guardian Safe can cancel a pending one.`,
        facts: [
          { label: "Amount", value: formatArl(treasury.amount), mono: true },
          { label: "Share of supply", value: share("treasury"), mono: true },
          {
            label: "Approval",
            value: `${treasuryControls.threshold} of ${treasuryControls.signers} Safe signers`,
          },
          { label: "Minimum delay", value: `${treasuryControls.minDelayHours} hours` },
          { label: "Deployment", value: NOT_DEPLOYED },
        ],
      },
    },
    {
      id: "vesting",
      title: "Vesting",
      shortDescription: "Investors and strategic partnerships",
      status: "IN DEVELOPMENT",
      weight: "secondary",
      metric: { kind: "static", value: String(vesting.length), unit: "vesting wallets" },
      detail: {
        summary:
          "These allocations are held by vesting wallets that release only to a dedicated Safe, only on their schedule. The schedules (start, cliff and duration) are not decided yet; no vesting wallet can be deployed to a public network until they are.",
        facts: [
          ...vesting.map((a) => ({
            label: `${a.name} · ${formatArl(a.amount)}`,
            value: "Schedule TBD",
          })),
          {
            label: `Team · ${formatArl(allocation("team").amount)}`,
            value: "Per-member grants from a team pool Safe; schedule TBD",
          },
        ],
      },
    },
    {
      id: "contract-address",
      title: "Contract Address",
      shortDescription: "No contract on any network",
      status: "PLANNED",
      weight: "secondary",
      metric: { kind: "unavailable", label: NOT_DEPLOYED, source: "chain.contractAddress" },
      detail: {
        summary:
          "No ARL contract exists on any network. Any address presented as ARL today is not official. The official address will be published here and in the repository at deployment.",
      },
    },
    {
      id: "staked",
      title: "Staked",
      shortDescription: "No staking contract exists.",
      status: "PLANNED",
      weight: "tertiary",
      metric: { kind: "unavailable", label: NOT_DEPLOYED, source: "chain.stakedSupply" },
      detail: {
        summary: `No staking contract exists. Rewards are planned to come from the Community & Staking allocation (${formatArl(allocation("community-staking").amount)}) or from protocol revenue. Staking never creates new ARL.`,
      },
    },
    {
      id: "liquidity",
      title: "Liquidity / Exchange",
      shortDescription: "Not listed on any exchange",
      status: "PLANNED",
      weight: "tertiary",
      metric: { kind: "unavailable", label: "Not listed", source: "market.listings" },
      detail: {
        summary: `ARL is not listed on any exchange. ${formatArl(allocation("liquidity").amount)} is allocated to liquidity and held in a dedicated Safe. A listing is never guaranteed.`,
      },
    },
    {
      id: "decimals",
      title: "Decimals",
      shortDescription: "1 ARL = 10^18 base units",
      status: "IN DEVELOPMENT",
      weight: "tertiary",
      metric: { kind: "static", value: "18" },
      detail: {
        summary: "ARL uses 18 decimals, the ERC-20 default. One ARL is 10^18 base units.",
      },
    },
    {
      id: "standard",
      title: "Standard",
      shortDescription: "ERC-20 with EIP-2612 permit",
      status: "IN DEVELOPMENT",
      weight: "tertiary",
      metric: { kind: "static", value: "ERC-20" },
      detail: {
        summary:
          "ARL is an ERC-20 token with EIP-2612 permit, which allows approvals by signature. Both are OpenZeppelin Contracts v5.6.1 implementations, used without modification.",
        facts: [
          { label: "Name / symbol", value: "ARL / ARL" },
          { label: "Signed approvals", value: "EIP-2612" },
          { label: "Library", value: "OpenZeppelin Contracts v5.6.1" },
        ],
      },
    },
    {
      id: "network",
      title: "Network",
      shortDescription: "EVM. Chain not selected.",
      status: "PLANNED",
      weight: "tertiary",
      metric: { kind: "unavailable", label: "Not selected", source: "chain.network" },
      detail: {
        summary:
          "ARL is built for EVM-compatible chains. The deployment chain has not been selected; the evaluation is documented in the repository.",
      },
      links: [{ label: "Chain evaluation", href: repoDoc("docs/chain-evaluation.md") }],
    },
  ],
};
