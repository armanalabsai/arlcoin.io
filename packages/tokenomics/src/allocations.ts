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
      /** Linear vesting with no cliff, from `start`, in calendar months. */
      readonly kind: "linear";
      readonly vestingMonths: number;
      readonly start: VestingStart;
      readonly status: DecisionStatus;
      readonly note?: string;
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
 * When a `linear` schedule starts.
 * - deployment: the timestamp at which the vesting wallet is deployed.
 * - initial-program-end: the end of the allocation's initial program period
 *   (`initialProgram.durationMonths` after deployment).
 */
export type VestingStart = "deployment" | "initial-program-end";

/**
 * Where an allocation's tokens are held at genesis (M-2, decided 2026-09-27).
 *
 * Safe signer lists and thresholds are operational configuration. They are
 * never recorded here, apart from the treasury's approved policy.
 */
export type Custody =
  | {
      /**
       * A vesting wallet holds the tokens and releases them to a dedicated
       * Safe that holds no other allocation.
       */
      readonly holder: "vesting-wallet";
      readonly beneficiary: "dedicated-safe";
    }
  | {
      /**
       * A Safe holds the tokens directly, with no vesting. `dedicated` is set
       * only where a dedicated Safe has been decided.
       */
      readonly holder: "safe";
      readonly dedicated?: true;
    }
  | {
      /** The treasury timelock holds the tokens; see the release controls. */
      readonly holder: "timelock";
    }
  | {
      /**
       * A dedicated pool Safe holds the tokens, with no pool-level vesting.
       * Each approved grant is funded from the pool into its own vesting
       * wallet whose beneficiary is the recipient's own Safe; the release
       * rule then applies per grant, from its grant date.
       */
      readonly holder: "grant-pool";
      readonly grantBeneficiary: "recipient-safe";
    };

/** A separately held portion of an allocation. */
export interface AllocationPart {
  readonly id: string;
  /** Whole ARL. */
  readonly amount: number;
  readonly custody: Custody;
  readonly release: Release;
}

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
  /** Genesis custody. Absent only when `parts` defines custody per portion. */
  readonly custody?: Custody;
  /** Separately held portions; their amounts add up to `amount`. */
  readonly parts?: readonly AllocationPart[];
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
    custody: { holder: "vesting-wallet", beneficiary: "dedicated-safe" },
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
    custody: { holder: "vesting-wallet", beneficiary: "dedicated-safe" },
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
    custody: { holder: "timelock" },
  },
  {
    id: "community-staking",
    name: "Community / Staking",
    amount: 3_000_000,
    purpose: "Staking rewards and community programs.",
    release: {
      kind: "linear",
      vestingMonths: 60,
      start: "deployment",
      status: "approved",
      note: "Rewards are paid from this allocation or from protocol revenue. Staking never issues new ARL.",
    },
    custody: { holder: "vesting-wallet", beneficiary: "dedicated-safe" },
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
    custody: { holder: "safe" },
  },
  {
    id: "strategic-partnerships",
    name: "Strategic Partnerships",
    amount: 1_500_000,
    purpose: "Reserved for future partners. No partnership has been announced.",
    release: {
      kind: "linear",
      vestingMonths: 36,
      start: "deployment",
      status: "approved",
      note: "Released per signed agreement, limited to the amount that has vested and is available in the vesting wallet.",
    },
    custody: { holder: "vesting-wallet", beneficiary: "dedicated-safe" },
  },
  {
    id: "public-launch",
    name: "Public Launch",
    amount: 1_000_000,
    purpose: "Reserved for a future public launch. No sale is scheduled.",
    // Custody is decided; the launch terms are not.
    release: { kind: "program", description: "Terms set before any launch.", status: "undecided" },
    custody: { holder: "safe" },
  },
  {
    id: "grants-bug-bounty",
    name: "Grants / Bug Bounty",
    amount: 400_000,
    purpose: "Builder grants and security bug bounties.",
    release: {
      kind: "program",
      description: "Paid per grant or bounty award. No release schedule.",
      status: "approved",
    },
    custody: { holder: "safe" },
  },
  {
    id: "team",
    name: "Team",
    amount: 500_000,
    purpose:
      "Core team members. Separate from the founder allocation. Individual grants are not assigned yet; unassigned tokens are held in a dedicated team pool Safe, from which approved grants are funded.",
    // Applies per member from their grant date, each with a separate schedule.
    release: { kind: "cliff-linear", cliffMonths: 12, vestingMonths: 36, status: "approved" },
    custody: { holder: "grant-pool", grantBeneficiary: "recipient-safe" },
  },
  {
    id: "early-user-rewards",
    name: "Mining / Early User Rewards",
    amount: 500_000,
    purpose: "Rewards for verified early protocol usage. Not proof-of-work mining.",
    release: {
      kind: "program",
      description:
        "Distributed through reward programs. Amounts beyond the initial program vest to a dedicated Safe and are distributed by future programs.",
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
    parts: [
      {
        id: "initial-program",
        amount: 100_000,
        custody: { holder: "safe" },
        release: {
          kind: "program",
          description: "The initial program: at most 100,000 ARL during the first 6 months.",
          status: "approved",
        },
      },
      {
        id: "vesting",
        amount: 400_000,
        custody: { holder: "vesting-wallet", beneficiary: "dedicated-safe" },
        release: {
          kind: "linear",
          vestingMonths: 36,
          start: "initial-program-end",
          status: "approved",
        },
      },
    ],
  },
]);
