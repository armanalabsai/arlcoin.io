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
// The Founder allocation is one economic allocation of 2,100,000 ARL held in
// two tranches: Founder Unrestricted (2,000,000 ARL, unlocked at TGE) and
// Founder Reserved (100,000 ARL, treatment and custody TBD). Neither vests.

/** Hard cap. No mechanism may ever create supply above this value. */
export const MAX_SUPPLY = 21_000_000;

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
       * Released by a vesting wallet. The schedule (start, cliff, duration)
       * is not decided: deployment configuration supplies it, and deployment
       * off local Anvil is refused until it is approved.
       */
      readonly kind: "vesting";
      readonly schedule: "tbd";
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
      /** The allocation is held in tranches, each with its own release rule. */
      readonly kind: "tranches";
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
    }
  | {
      /**
       * Minted at genesis and held apart, with no release rule. Not vested and
       * not scheduled. Its treatment is not decided.
       */
      readonly kind: "reserved";
      readonly description: string;
      readonly status: DecisionStatus;
    };

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
    }
  | {
      /** Each tranche has its own holder; see `tranches`. */
      readonly holder: "tranches";
    }
  | {
      /**
       * Custody is not decided. Deployment off local Anvil is refused until it
       * is approved; local rehearsals use a placeholder address.
       */
      readonly holder: "tbd";
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

/** Part of an allocation with its own genesis holder and release rule. */
export interface Tranche {
  readonly id: string;
  readonly name: string;
  /** Whole ARL. */
  readonly amount: number;
  readonly purpose: string;
  readonly release: Release;
  readonly custody: Custody;
}

export interface Allocation {
  readonly id: string;
  readonly name: string;
  /** Whole ARL. */
  readonly amount: number;
  readonly purpose: string;
  readonly release: Release;
  readonly custody: Custody;
  /**
   * Present only when the allocation is held in tranches (release kind and
   * custody holder "tranches"). The tranche amounts add up to `amount`.
   */
  readonly tranches?: readonly Tranche[];
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

const VESTING_TBD: Release = { kind: "vesting", schedule: "tbd", status: "undecided" };

/** In canonical order. */
export const ALLOCATIONS: readonly Allocation[] = deepFreeze([
  {
    id: "public-launch",
    name: "Public Launch",
    amount: 5_000_000,
    purpose: "Initial market distribution. No sale is scheduled.",
    release: { kind: "program", description: "Terms set before any launch.", status: "undecided" },
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
      ...VESTING_TBD,
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
        "Held as a reserve. The amount used for any pool or listing is decided separately; control of LP positions is documented before any pool is created.",
      status: "approved",
    },
    custody: { holder: "safe" },
  },
  {
    id: "founder",
    name: "Founder",
    amount: 2_100_000,
    purpose:
      "Founder allocation, in two tranches: 2,000,000 ARL unrestricted at TGE and 100,000 ARL reserved, whose treatment is not decided.",
    release: {
      kind: "tranches",
      description: "Each tranche has its own rule. The Founder allocation does not vest.",
      status: "approved",
    },
    custody: { holder: "tranches" },
    tranches: [
      {
        id: "founder-unrestricted",
        name: "Founder Unrestricted",
        amount: 2_000_000,
        purpose: "Fully unlocked and available to the Founder at TGE.",
        release: {
          kind: "unrestricted",
          description:
            "No cliff, vesting, timelock or protocol-level transfer or sale restriction. An ordinary ERC-20 holder: transferable and sellable at any time.",
          status: "approved",
        },
        custody: { holder: "safe" },
      },
      {
        id: "founder-reserved",
        name: "Founder Reserved",
        amount: 100_000,
        purpose:
          "Reserved part of the Founder allocation. Held apart from the unrestricted tranche.",
        release: {
          kind: "reserved",
          description:
            "Not vested and not scheduled. Its treatment and custody are not decided (TBD).",
          status: "undecided",
        },
        custody: { holder: "tbd" },
      },
    ],
  },
  {
    id: "investors",
    name: "Investors / Strategic Capital",
    amount: 1_500_000,
    purpose: "Investors and strategic capital. Not unlocked at launch by default.",
    release: VESTING_TBD,
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
      controls: { wallet: "Safe", threshold: 3, signers: 5, minDelayHours: 48 },
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
        "Grants are irrevocable and made in tranches, each funded from the pool into its own vesting wallet whose beneficiary is the member's own Safe. The grant vesting schedule is not defined.",
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
