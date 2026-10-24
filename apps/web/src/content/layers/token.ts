import {
  ALLOCATIONS,
  MAX_SUPPLY,
  MIN_TIMELOCK_HOURS,
  formatBasisPoints,
  shareOfSupply,
} from "../../../../../packages/tokenomics/src/index.ts";
import type { Allocation } from "../../../../../packages/tokenomics/src/index.ts";
import { SITE, TOKEN_DISCLAIMER, repoDoc } from "../site.ts";
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
          "The entire supply is assigned at deployment to eleven allocations, each held by its own vesting wallet, timelock or dedicated Safe. The Founder allocation of 2,100,000 ARL is fully unlocked at TGE with no vesting. Amounts are exact and add up to 21,000,000 ARL; shares are rounded to two decimals.",
        facts: allocationFacts,
      },
      links: [{ label: "Tokenomics", href: repoDoc("docs/tokenomics.md") }],
    },
    {
      id: "circulating-supply",
      title: "Circulating Supply",
      shortDescription: "Computed from the chain, published at arlcoin.io/api/supply",
      status: "IN DEVELOPMENT",
      weight: "secondary",
      metric: {
        kind: "unavailable",
        label: "See arlcoin.io/api/supply",
        source: "chain.circulatingSupply",
      },
      detail: {
        summary:
          "Circulating supply is computed from on-chain balances on Base Mainnet and published at arlcoin.io/api/supply. At deployment it was 2,100,000 ARL, the Founder allocation; the other 18,900,000 ARL sit in vesting wallets, the timelock and allocation Safes and count as locked. Allocated supply is not circulating supply. The methodology is in the tokenomics document.",
      },
      links: [{ label: "Supply methodology", href: repoDoc("docs/tokenomics.md") }],
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
          { label: "Timelock on Base", value: SITE.mainnet.timelock, mono: true },
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
          "These allocations are held by vesting wallets that release only to a dedicated Safe, only on their schedule: nothing at the start, a 12-month cliff, then 36 months of linear vesting. Every schedule starts at the TGE date, 23 October 2026, so the cliff ends on 23 October 2027.",
        facts: [
          ...vesting.map((a) => ({
            label: `${a.name} · ${formatArl(a.amount)}`,
            value:
              a.release.kind === "vesting"
                ? `${String(a.release.schedule.cliffMonths)}-month cliff, then ${String(a.release.schedule.linearMonths)} months linear from the TGE`
                : "Schedule TBD",
          })),
          {
            label: `Team · ${formatArl(allocation("team").amount)}`,
            value:
              "Per-member grants from a team pool Safe; each grant: 12-month cliff, then 36 months linear",
          },
        ],
      },
    },
    {
      id: "contract-address",
      title: "Contract Address",
      shortDescription: "Base Mainnet, source-verified on Basescan",
      status: "LIVE",
      weight: "secondary",
      metric: {
        kind: "static",
        value: `${SITE.mainnet.token.slice(0, 6)}…${SITE.mainnet.token.slice(-4)}`,
      },
      detail: {
        summary: `The official ARL contract on Base Mainnet is ${SITE.mainnet.token}, deployed on ${SITE.mainnet.deployedOn} and source-verified on Basescan. Any other address presented as ARL is not official. The Base Sepolia testnet token (${SITE.testnet.token}) has no value.`,
      },
      links: [
        { label: "ARL on Basescan", href: SITE.mainnet.explorer },
        { label: "Testnet token on Basescan", href: SITE.testnet.explorer },
      ],
    },
    {
      id: "staked",
      title: "Staked",
      shortDescription: "Staking live on Base Sepolia testnet",
      status: "PLANNED",
      weight: "tertiary",
      metric: {
        kind: "unavailable",
        label: "Not on Base Mainnet yet",
        source: "chain.stakedSupply",
      },
      detail: {
        summary: `The staking contract is deployed on Base Sepolia (testnet), where staked tokens have no value; there is no staking on Base Mainnet yet. Rewards are planned to come from the Community & Staking allocation (${formatArl(allocation("community-staking").amount)}) or from protocol revenue. Staking never creates new ARL.`,
      },
    },
    {
      id: "liquidity",
      title: "Liquidity / Exchange",
      shortDescription: "Uniswap v3 on Base; no centralised exchange",
      status: "LIVE",
      weight: "tertiary",
      metric: { kind: "unavailable", label: "Uniswap v3 · Base", source: "market.listings" },
      detail: {
        summary: `ARL trades in four Uniswap v3 pools on Base (ARL/USDC, ARL/USDT, ARL/WETH and ARL/cbBTC, 1% fee tier), opened with 5,000,000 ARL from the Liquidity Safe (${formatArl(allocation("liquidity").amount)}) and the Public Launch Safe (3,000,000 ARL), from 0.20 USD per ARL. ARL is not listed on any centralised exchange, and a listing is never guaranteed.`,
      },
      links: [{ label: "How to get ARL", href: "https://arlcoin.io/buy/" }],
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
      shortDescription: "Base Mainnet (chain 8453)",
      status: "LIVE",
      weight: "tertiary",
      metric: { kind: "static", value: "Base" },
      detail: {
        summary:
          "ARL is an ERC-20 token on Base, an Ethereum layer 2. It is live on Base Mainnet (chain 8453) since 24 October 2026; the testnet deployment on Base Sepolia (chain 84532) keeps running for the app. The evaluation that selected Base is documented in the repository.",
      },
      links: [{ label: "Chain evaluation", href: repoDoc("docs/chain-evaluation.md") }],
    },
  ],
};
