// ARL allocation table — the single source of truth.
//
// Every consumer (website, documentation, future deployment and genesis
// scripts) reads these values from here. Amounts are whole ARL; conversion to
// base units happens only once the token's decimals are fixed in Phase 1.

/** Hard cap. No mechanism may ever create supply above this value. */
export const MAX_SUPPLY = 21_000_000;

/**
 * How settled a rule is.
 * - approved: confirmed by the project lead; may be implemented.
 * - proposal: documented recommendation awaiting approval; must not be
 *   implemented in contracts until approved.
 * - undecided: no recommendation yet.
 */
export type DecisionStatus = "approved" | "proposal" | "undecided";

export type Release =
  | {
      readonly kind: "cliff-linear";
      readonly cliffMonths: number;
      readonly vestingMonths: number;
      readonly status: DecisionStatus;
    }
  | {
      readonly kind: "annual-cap";
      readonly maxPerYear: number;
      readonly years: number;
      readonly status: DecisionStatus;
      readonly note: string;
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
      readonly initialProgram?: {
        readonly maxAmount: number;
        readonly durationMonths: number;
        readonly eligibility: readonly string[];
        readonly status: DecisionStatus;
      };
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

export const ALLOCATIONS: readonly Allocation[] = deepFreeze([
  {
    id: "founder",
    name: "Founder",
    amount: 2_100_000,
    purpose: "Founder allocation, held in a dedicated vesting contract.",
    release: { kind: "cliff-linear", cliffMonths: 24, vestingMonths: 36, status: "approved" },
  },
  {
    id: "ecosystem-reserve",
    name: "Ecosystem Reserve",
    amount: 7_000_000,
    purpose:
      "Protocol development, strategic partnerships, ecosystem development, staking incentives, infrastructure and grants.",
    release: {
      kind: "annual-cap",
      maxPerYear: 1_400_000,
      years: 5,
      status: "approved",
      note: "Unlocked tokens remain in the reserve until spent; an unlock is not a sale.",
    },
  },
  {
    id: "treasury",
    name: "Treasury",
    amount: 3_000_000,
    purpose: "Operating treasury.",
    release: {
      kind: "custody",
      description:
        "Safe multisig with a timelock and separated roles. Signer addresses are configured only when the production Safe is created.",
      status: "approved",
      controls: { wallet: "Safe", threshold: 3, signers: 5, minDelayHours: 48 },
    },
  },
  {
    id: "community-staking",
    name: "Community / Staking",
    amount: 3_000_000,
    purpose: "Staking rewards and community programs.",
    release: {
      kind: "program",
      description:
        "Rewards are paid from this allocation or from protocol revenue. Staking never issues new ARL.",
      status: "approved",
    },
  },
  {
    id: "liquidity",
    name: "Liquidity",
    amount: 2_000_000,
    purpose: "DEX liquidity, deployed in stages.",
    release: {
      kind: "custody",
      description:
        "Held as a reserve. The amount used for the first DEX pool is decided separately; control of LP positions is documented before any pool is created.",
      status: "approved",
    },
  },
  {
    id: "strategic-partnerships",
    name: "Strategic Partnerships",
    amount: 1_500_000,
    purpose: "Reserved for future partners. No partnership has been announced.",
    release: {
      kind: "program",
      description: "Released per signed agreement.",
      status: "undecided",
    },
  },
  {
    id: "public-launch",
    name: "Public Launch",
    amount: 1_000_000,
    purpose: "Reserved for a future public launch. No sale is scheduled.",
    release: { kind: "program", description: "Terms set before any launch.", status: "undecided" },
  },
  {
    id: "grants-bug-bounty",
    name: "Grants / Bug Bounty",
    amount: 400_000,
    purpose: "Builder grants and security bug bounties.",
    release: {
      kind: "program",
      description: "Paid per grant or bounty award.",
      status: "undecided",
    },
  },
  {
    id: "team",
    name: "Team",
    amount: 500_000,
    purpose:
      "Core team members. Separate from the founder allocation. Individual grants are not assigned yet; unassigned tokens stay locked in a multisig-controlled pool.",
    // Applies per member from their grant date, each with a separate schedule.
    release: { kind: "cliff-linear", cliffMonths: 12, vestingMonths: 36, status: "approved" },
  },
  {
    id: "early-user-rewards",
    name: "Mining / Early User Rewards",
    amount: 500_000,
    purpose: "Rewards for verified early protocol usage. Not proof-of-work mining.",
    release: {
      kind: "program",
      description:
        "Distributed through reward programs. Amounts beyond the initial program are governed by future programs.",
      status: "approved",
      initialProgram: {
        maxAmount: 100_000,
        durationMonths: 6,
        eligibility: [
          "Early AI service usage",
          "Compute provider participation",
          "Compute consumption",
          "Developer and testnet activity",
          "Other objectively measurable protocol usage",
        ],
        status: "approved",
      },
    },
  },
]);
