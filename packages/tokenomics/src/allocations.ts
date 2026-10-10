// ARL allocation table — the single source of truth.
//
// Every consumer (website, documentation, deployment planner, and the Solidity
// allocation library through a consistency test) reads these values from
// here. Amounts are whole ARL integers; base units (18 decimals) are derived
// only when a plan is built.
//
// This is the 11-allocation model approved on 2026-09-27 (M-2 model
// replacement). It supersedes the 10-allocation Phase 1 table, including the
// former 7,000,000 ARL Ecosystem Reserve, which no longer exists.
//
// The Founder allocation of 2,100,000 ARL is held in the Founder Safe and is
// fully unlocked at TGE. It does not vest.

/** Hard cap. No mechanism may ever create supply above this value. */
export const MAX_SUPPLY = 21_000_000;

/**
 * The approved TGE date (owner decision, 2026-10-05). Every vesting schedule starts at the TGE
 * (VESTING_START = TGE_TIMESTAMP). The TGE itself is the Base Mainnet token deployment.
 */
export const TGE_DATE = "2026-11-01T00:00:00Z";

/**
 * Approved Public Launch parameters (owner decision, 2026-10-05; economic specification
 * section 7). Amounts in whole ARL.
 */
export const PUBLIC_LAUNCH = {
  /** Distributed through the Merkle claim at TGE. */
  tgeTranche: 500_000,
  /**
   * Kept in the Public Launch Safe for launchpad sales (owner decision 2026-10-10). The rest,
   * 2,000,000 ARL, is sold through Uniswap positions; that sale awaits legal approval.
   */
  launchpadReserve: 2_500_000,
  /** Largest single claim. */
  maxPerAddress: 10_000,
  /** Claim window; afterwards the remainder can only return to the Public Launch Safe. */
  claimWindowDays: 60,
} as const;

/**
 * How settled a rule is.
 * - approved: confirmed by the project lead; may be implemented.
 * - proposal: documented recommendation awaiting approval; must not be
 *   implemented in contracts until approved.
 * - undecided: no decision yet (TBD).
 */
export type DecisionStatus = "approved" | "proposal" | "undecided";

export type Release =
  | {
      /**
       * Released by a vesting wallet: nothing before the cliff ends, then
       * linear. The durations are in calendar months. The start date is
       * supplied by deployment configuration; while it is not confirmed,
       * deployment off local Anvil is refused.
       */
      readonly kind: "vesting";
      readonly schedule: VestingSchedule;
      readonly status: DecisionStatus;
      readonly note?: string;
    }
  | {
      readonly kind: "custody";
      readonly description: string;
      readonly status: DecisionStatus;
      readonly controls?: MultisigControls;
    }
  | {
      readonly kind: "program";
      readonly description: string;
      readonly status: DecisionStatus;
    }
  | {
      /**
       * Fully unlocked at TGE: no cliff, vesting, timelock or protocol-level
       * transfer or sale restriction. The holder is an ordinary ERC-20 holder.
       */
      readonly kind: "unrestricted";
      readonly description: string;
      readonly status: DecisionStatus;
    };

/** An approved vesting schedule: 0% at the start, a cliff, then linear vesting. */
export interface VestingSchedule {
  /** Calendar months before anything vests. */
  readonly cliffMonths: number;
  /** Calendar months of linear vesting after the cliff. */
  readonly linearMonths: number;
  /**
   * Whether the start date is confirmed. Investors and partnerships start at the TGE
   * (VESTING_START = TGE_TIMESTAMP, decided); "approved" once the TGE date (`TGE_DATE`) is set.
   */
  readonly start: "tbd" | "approved";
}

/**
 * Where an allocation's tokens are held at genesis (custody architecture
 * approved 2026-09-27). Every Safe is dedicated to one allocation.
 *
 * Safe signer lists and thresholds are operational configuration. They are
 * never recorded here, apart from the treasury's approved policy.
 */
export type Custody =
  | {
      /** A vesting wallet holds the tokens and releases them to a dedicated Safe. */
      readonly holder: "vesting-wallet";
      readonly beneficiary: "dedicated-safe";
    }
  | {
      /** A dedicated Safe holds the tokens directly. */
      readonly holder: "safe";
    }
  | {
      /** The treasury timelock holds the tokens; see the release controls. */
      readonly holder: "timelock";
    }
  | {
      /**
       * A dedicated pool Safe holds the tokens. Each approved grant is funded
       * from the pool into its own vesting wallet whose beneficiary is the
       * recipient's own Safe.
       */
      readonly holder: "grant-pool";
      readonly grantBeneficiary: "recipient-safe";
    };

/**
 * Approval policy for a multisig-held allocation. Signer addresses are
 * deliberately absent: they are configured only when the production Safe is
 * created, never committed here.
 */
export interface MultisigControls {
  readonly wallet: "Safe";
  readonly threshold: number;
  readonly signers: number;
  /** Minimum delay between approval and execution, in hours. */
  readonly minDelayHours: number;
}

/** Protocol floor for any multisig timelock delay. */
export const MIN_TIMELOCK_HOURS = 48;

export interface Allocation {
  readonly id: string;
  readonly name: string;
  /** Whole ARL. */
  readonly amount: number;
  readonly purpose: string;
  readonly release: Release;
  readonly custody: Custody;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * Approved schedule (economic specification section 4.1): 0% at TGE, a
 * 12-month cliff, then 36 months linear, starting at the TGE (VESTING_START =
 * TGE_TIMESTAMP). The TGE date is `TGE_DATE` (approved 2026-10-05).
 */
const VESTING_12_36: Release = {
  kind: "vesting",
  schedule: { cliffMonths: 12, linearMonths: 36, start: "approved" },
  status: "approved",
};

/** In canonical order. */
export const ALLOCATIONS: readonly Allocation[] = deepFreeze([
  {
    id: "public-launch",
    name: "Public Launch",
    amount: 5_000_000,
    purpose: "Initial market distribution. No sale is scheduled.",
    release: {
      kind: "program",
      description:
        "Distributed through a Merkle claim from a published list: 500,000 ARL free at TGE to whitelist sign-ups, at most 10,000 ARL per address, claimable for 60 days. Unclaimed tokens and the remaining 4,500,000 ARL stay in the Public Launch Safe for a launchpad sale and later tranches.",
      status: "approved",
    },
    custody: { holder: "safe" },
  },
  {
    id: "community-staking",
    name: "Community & Staking",
    amount: 3_000_000,
    purpose: "Staking and community rewards.",
    release: {
      kind: "program",
      description:
        "Rewards are paid from this allocation or from protocol revenue. Staking never issues new ARL. Reward rates and schedule are not defined.",
      status: "undecided",
    },
    custody: { holder: "safe" },
  },
  {
    id: "ecosystem-growth",
    name: "Ecosystem & Growth",
    amount: 2_000_000,
    purpose: "User acquisition, referral and ecosystem growth.",
    release: {
      kind: "program",
      description:
        "Distributed through programs tied to genuine, verifiable activity. Program rules, rates and schedule are not defined.",
      status: "undecided",
    },
    custody: { holder: "safe" },
  },
  {
    id: "strategic-partnerships",
    name: "Strategic Partnerships",
    amount: 2_000_000,
    purpose: "Strategic partners. No partnership has been announced.",
    release: {
      ...VESTING_12_36,
      note: "Not an unconditional pool. Intended flow: partnership, milestone, vesting, release. Milestones are not defined.",
    },
    custody: { holder: "vesting-wallet", beneficiary: "dedicated-safe" },
  },
  {
    id: "liquidity",
    name: "Liquidity",
    amount: 2_000_000,
    purpose: "DEX and CEX liquidity.",
    release: {
      kind: "custody",
      description:
        "Held as a reserve. The first pool needs no project cash: it is paired with launch proceeds, or opened single-sided with ARL only above the 0.20 USD listing price. LP positions are held by the Liquidity Safe and locked for 12 months.",
      status: "approved",
    },
    custody: { holder: "safe" },
  },
  {
    id: "founder",
    name: "Founder",
    amount: 2_100_000,
    purpose: "Founder allocation, fully unlocked and available to the Founder at TGE.",
    release: {
      kind: "unrestricted",
      description:
        "No cliff, vesting, timelock or protocol-level transfer or sale restriction. An ordinary ERC-20 holder: transferable and sellable at any time.",
      status: "approved",
    },
    custody: { holder: "safe" },
  },
  {
    id: "investors",
    name: "Investors / Strategic Capital",
    amount: 1_500_000,
    purpose: "Investors and strategic capital. Not unlocked at launch by default.",
    release: VESTING_12_36,
    custody: { holder: "vesting-wallet", beneficiary: "dedicated-safe" },
  },
  {
    id: "treasury",
    name: "Treasury",
    amount: 1_000_000,
    purpose: "Long-term operations.",
    release: {
      kind: "custody",
      description:
        "Held by a timelock controlled by the Treasury Safe, with a cancel-only guardian. Signer addresses are configured only when the production Safe is created.",
      status: "approved",
      controls: { wallet: "Safe", threshold: 2, signers: 3, minDelayHours: 48 },
    },
    custody: { holder: "timelock" },
  },
  {
    id: "team",
    name: "Team",
    amount: 900_000,
    purpose:
      "Core team. Separate from the founder allocation. Individual grants are not assigned yet; unassigned tokens are held in a dedicated team pool Safe.",
    release: {
      kind: "program",
      description:
        "Grants are irrevocable and made in tranches, each funded from the pool into its own vesting wallet whose beneficiary is the member's own Safe. Each grant vests with 0% at the grant date, a 12-month cliff, then 36 months linear. Tranche sizes and the use of unassigned pool tokens are not defined.",
      status: "undecided",
    },
    custody: { holder: "grant-pool", grantBeneficiary: "recipient-safe" },
  },
  {
    id: "early-users",
    name: "Early Users",
    amount: 1_100_000,
    purpose: "Rewards for verified early protocol usage. Not proof-of-work mining.",
    release: {
      kind: "program",
      description:
        "Rewards require genuine, verifiable usage; connecting a wallet alone earns nothing. Reward amounts, eligibility rules and schedule are not defined.",
      status: "undecided",
    },
    custody: { holder: "safe" },
  },
  {
    id: "grants-bug-bounty",
    name: "Grants / Bug Bounty",
    amount: 400_000,
    purpose: "Developer grants and security bug bounties.",
    release: {
      kind: "program",
      description: "Paid per grant or bounty award.",
      status: "undecided",
    },
    custody: { holder: "safe" },
  },
]);
