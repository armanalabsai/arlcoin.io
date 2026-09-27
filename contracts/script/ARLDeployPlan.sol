// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Vm} from "forge-std/Vm.sol";

import {ARLAllocation} from "../src/ARLAllocation.sol";

/// @notice One allocation amount per recipient, in base units, in canonical order. Field order
/// matches `ARLToken.Recipients`.
struct Allocations {
    uint256 publicLaunch;
    uint256 communityStaking;
    uint256 ecosystemGrowth;
    uint256 strategicPartnerships;
    uint256 liquidity;
    uint256 founder;
    uint256 investors;
    uint256 treasury;
    uint256 team;
    uint256 earlyUsers;
    uint256 grantsBugBounty;
}

/// @notice The Founder allocation's two tranches, in base units. Together they must equal
/// `Allocations.founder`.
struct FounderTranches {
    uint256 unrestricted;
    uint256 reserved;
}

/// @notice Holders of the allocations that are minted directly to a planned address: seven
/// dedicated Safes, the Founder Unrestricted Safe and the Founder Reserved holder, whose custody
/// is not decided yet.
struct Recipients {
    address publicLaunch;
    address communityStaking;
    address ecosystemGrowth;
    address liquidity;
    address founderUnrestricted;
    address founderReserved;
    address team;
    address earlyUsers;
    address grantsBugBounty;
}

/// @notice A vesting wallet to deploy: its beneficiary Safe and explicit schedule timestamps.
struct VestingPlan {
    address beneficiary;
    uint64 cliffStart;
    uint64 cliffEnd;
    uint64 vestingEnd;
}

/// @notice A deployment plan, as produced by `packages/deploy` (schema `arl-deploy-plan/3`).
/// The Founder allocation does not vest: it has no vesting plan.
struct Plan {
    uint256 chainId;
    bool requireRecipientCode;
    uint256 maxSupply;
    Allocations allocations;
    FounderTranches founderTranches;
    VestingPlan investors;
    VestingPlan strategicPartnerships;
    address treasurySafe;
    address treasuryGuardian;
    uint256 minDelay;
    Recipients recipients;
}

/// @title Deployment plan loading and validation
/// @notice Every rule fails closed: `validate` reverts on the first violation. The deployment
/// script calls it before broadcasting anything, so a hand-edited plan cannot bypass the rules
/// that the TypeScript planner already applied.
library ARLDeployPlan {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @dev Anvil's default chain ID; the only chain where recipients may lack code and where
    /// vesting schedules that are not yet approved may be rehearsed.
    uint256 internal constant LOCAL_CHAIN_ID = 31337;

    /// @dev The investor and strategic partnership vesting schedules are not recorded as
    /// approved. Until they are, no plan may target a chain other than local Anvil.
    bool internal constant VESTING_SCHEDULES_APPROVED = false;

    /// @dev The custody of the Founder Reserved tranche (100,000 ARL) is not decided (TBD).
    /// Until it is approved and recorded here, no plan may target a chain other than local
    /// Anvil. Local rehearsals use a placeholder address that is not a custody decision.
    bool internal constant FOUNDER_RESERVE_CUSTODY_APPROVED = false;

    /// @dev Plans of any other schema, including `arl-deploy-plan/2` with its founder vesting
    /// wallet, are rejected rather than reinterpreted.
    string internal constant PLAN_SCHEMA = "arl-deploy-plan/3";

    /// @dev Mirrors `ARLTimelock.MIN_DELAY_FLOOR` (Solidity cannot read another contract's
    /// constant by type). `ARLDeployPlanTest` asserts they are equal, and the timelock
    /// constructor enforces its own floor regardless.
    uint256 internal constant TIMELOCK_DELAY_FLOOR = 48 hours;

    uint256 internal constant ALLOCATION_COUNT = 11;
    uint256 internal constant RECIPIENT_COUNT = 9;
    uint256 internal constant VESTING_COUNT = 2;
    uint256 internal constant FOUNDER_TRANCHE_COUNT = 2;
    /// @dev Safe roles (12) plus the Founder Reserved holder.
    uint256 internal constant PLANNED_ADDRESS_COUNT = 13;

    error PlanMissingChainId();
    error PlanChainMismatch(uint256 planChainId, uint256 actualChainId);
    error PlanRecipientCodeRequired(uint256 chainId);
    error PlanVestingScheduleNotApproved(uint256 chainId);
    error PlanFounderReserveCustodyNotApproved(uint256 chainId);
    error PlanSchemaMismatch(string schema);
    error PlanFounderVestingNotAllowed();
    error PlanLegacyAllocation(string key);
    error PlanUnexpectedKeys(string field, uint256 count, uint256 expected);
    error PlanZeroAddress(string field);
    error PlanRecipientHasNoCode(string field, address account);
    error PlanAddressReused(string field, string otherField);
    error PlanAllocationMismatch(string field, uint256 planned, uint256 approved);
    error PlanSupplyMismatch(uint256 planned, uint256 approved);
    error PlanInvalidSchedule(string reason);
    error PlanDelayBelowFloor(uint256 delay, uint256 floor);
    error PlanGuardianNotIndependent(address guardian);

    /// @notice Parses a plan JSON document. Reverts if the schema is not `PLAN_SCHEMA`, if any
    /// field is missing or malformed, if a legacy allocation or a founder vesting plan is present,
    /// or if a section has more or fewer entries than the model.
    function load(string memory json) internal view returns (Plan memory p) {
        string memory schema = VM.parseJsonString(json, ".schema");
        if (keccak256(bytes(schema)) != keccak256(bytes(PLAN_SCHEMA))) {
            revert PlanSchemaMismatch(schema);
        }
        if (VM.keyExistsJson(json, ".vesting.founder")) revert PlanFounderVestingNotAllowed();
        if (VM.keyExistsJson(json, ".ecosystemReserve")) {
            revert PlanLegacyAllocation("ecosystemReserve");
        }
        if (VM.keyExistsJson(json, ".allocations.ecosystemReserve")) {
            revert PlanLegacyAllocation("allocations.ecosystemReserve");
        }
        _keyCount(json, ".allocations", "allocations", ALLOCATION_COUNT);
        _keyCount(json, ".recipients", "recipients", RECIPIENT_COUNT);
        _keyCount(json, ".vesting", "vesting", VESTING_COUNT);
        _keyCount(json, ".founderTranches", "founderTranches", FOUNDER_TRANCHE_COUNT);

        p.chainId = VM.parseJsonUint(json, ".chainId");
        p.requireRecipientCode = VM.parseJsonBool(json, ".requireRecipientCode");
        p.maxSupply = VM.parseJsonUint(json, ".maxSupply");

        p.allocations = Allocations({
            publicLaunch: VM.parseJsonUint(json, ".allocations.publicLaunch"),
            communityStaking: VM.parseJsonUint(json, ".allocations.communityStaking"),
            ecosystemGrowth: VM.parseJsonUint(json, ".allocations.ecosystemGrowth"),
            strategicPartnerships: VM.parseJsonUint(json, ".allocations.strategicPartnerships"),
            liquidity: VM.parseJsonUint(json, ".allocations.liquidity"),
            founder: VM.parseJsonUint(json, ".allocations.founder"),
            investors: VM.parseJsonUint(json, ".allocations.investors"),
            treasury: VM.parseJsonUint(json, ".allocations.treasury"),
            team: VM.parseJsonUint(json, ".allocations.team"),
            earlyUsers: VM.parseJsonUint(json, ".allocations.earlyUsers"),
            grantsBugBounty: VM.parseJsonUint(json, ".allocations.grantsBugBounty")
        });

        p.founderTranches = FounderTranches({
            unrestricted: VM.parseJsonUint(json, ".founderTranches.unrestricted"),
            reserved: VM.parseJsonUint(json, ".founderTranches.reserved")
        });

        p.investors = _vesting(json, ".vesting.investors");
        p.strategicPartnerships = _vesting(json, ".vesting.strategicPartnerships");

        p.treasurySafe = VM.parseJsonAddress(json, ".treasury.safe");
        p.treasuryGuardian = VM.parseJsonAddress(json, ".treasury.guardian");
        p.minDelay = VM.parseJsonUint(json, ".treasury.minDelay");

        p.recipients = Recipients({
            publicLaunch: VM.parseJsonAddress(json, ".recipients.publicLaunch"),
            communityStaking: VM.parseJsonAddress(json, ".recipients.communityStaking"),
            ecosystemGrowth: VM.parseJsonAddress(json, ".recipients.ecosystemGrowth"),
            liquidity: VM.parseJsonAddress(json, ".recipients.liquidity"),
            founderUnrestricted: VM.parseJsonAddress(json, ".recipients.founderUnrestricted"),
            founderReserved: VM.parseJsonAddress(json, ".recipients.founderReserved"),
            team: VM.parseJsonAddress(json, ".recipients.team"),
            earlyUsers: VM.parseJsonAddress(json, ".recipients.earlyUsers"),
            grantsBugBounty: VM.parseJsonAddress(json, ".recipients.grantsBugBounty")
        });
    }

    /// @notice Reverts unless the plan matches the current chain and every approved rule.
    function validate(Plan memory p) internal view {
        _validateChain(p);
        _validateAllocations(p);
        _validateFounderTranches(p);
        _validateAddresses(p);
        _validateSchedule("investors", p.investors);
        _validateSchedule("strategicPartnerships", p.strategicPartnerships);
        if (p.minDelay < TIMELOCK_DELAY_FLOOR) {
            revert PlanDelayBelowFloor(p.minDelay, TIMELOCK_DELAY_FLOOR);
        }
    }

    function _validateChain(Plan memory p) private view {
        if (p.chainId == 0) revert PlanMissingChainId();
        if (p.chainId != block.chainid) revert PlanChainMismatch(p.chainId, block.chainid);
        if (p.chainId != LOCAL_CHAIN_ID) {
            if (!p.requireRecipientCode) revert PlanRecipientCodeRequired(p.chainId);
            approvalGate(p.chainId, VESTING_SCHEDULES_APPROVED, FOUNDER_RESERVE_CUSTODY_APPROVED);
        }
    }

    /// @notice The public-network gate: off local Anvil, every pending decision must be
    /// approved. The approval flags are parameters only so tests can exercise each branch;
    /// `validate` always passes the constants above.
    function approvalGate(uint256 chainId, bool vestingApproved, bool reserveCustodyApproved)
        internal
        pure
    {
        if (chainId == LOCAL_CHAIN_ID) return;
        if (!vestingApproved) revert PlanVestingScheduleNotApproved(chainId);
        if (!reserveCustodyApproved) revert PlanFounderReserveCustodyNotApproved(chainId);
    }

    function _validateAllocations(Plan memory p) private pure {
        Allocations memory a = p.allocations;
        _allocation("publicLaunch", a.publicLaunch, ARLAllocation.PUBLIC_LAUNCH);
        _allocation("communityStaking", a.communityStaking, ARLAllocation.COMMUNITY_STAKING);
        _allocation("ecosystemGrowth", a.ecosystemGrowth, ARLAllocation.ECOSYSTEM_GROWTH);
        _allocation(
            "strategicPartnerships", a.strategicPartnerships, ARLAllocation.STRATEGIC_PARTNERSHIPS
        );
        _allocation("liquidity", a.liquidity, ARLAllocation.LIQUIDITY);
        _allocation("founder", a.founder, ARLAllocation.FOUNDER);
        _allocation("investors", a.investors, ARLAllocation.INVESTORS);
        _allocation("treasury", a.treasury, ARLAllocation.TREASURY);
        _allocation("team", a.team, ARLAllocation.TEAM);
        _allocation("earlyUsers", a.earlyUsers, ARLAllocation.EARLY_USERS);
        _allocation("grantsBugBounty", a.grantsBugBounty, ARLAllocation.GRANTS_BUG_BOUNTY);

        uint256 total = a.publicLaunch + a.communityStaking + a.ecosystemGrowth
            + a.strategicPartnerships + a.liquidity + a.founder + a.investors + a.treasury + a.team
            + a.earlyUsers + a.grantsBugBounty;
        if (total != ARLAllocation.MAX_SUPPLY) {
            revert PlanSupplyMismatch(total, ARLAllocation.MAX_SUPPLY);
        }
        if (p.maxSupply != ARLAllocation.MAX_SUPPLY) {
            revert PlanSupplyMismatch(p.maxSupply, ARLAllocation.MAX_SUPPLY);
        }
    }

    /// @dev The two Founder tranches are checked against their own constants and must add up
    /// to the Founder allocation exactly.
    function _validateFounderTranches(Plan memory p) private pure {
        FounderTranches memory f = p.founderTranches;
        _allocation(
            "founderTranches.unrestricted", f.unrestricted, ARLAllocation.FOUNDER_UNRESTRICTED
        );
        _allocation("founderTranches.reserved", f.reserved, ARLAllocation.FOUNDER_RESERVED);
        if (f.unrestricted + f.reserved != p.allocations.founder) {
            revert PlanAllocationMismatch(
                "founderTranches", f.unrestricted + f.reserved, p.allocations.founder
            );
        }
    }

    /// @dev Every Safe role is a dedicated Safe: non-zero, a contract off local Anvil, and not
    /// shared with any other role. The Founder Reserved holder must be non-zero and must not be
    /// shared with any role. Its custody is TBD, so no code requirement is imposed on it here;
    /// the approval gate blocks every non-local plan until that custody is approved.
    function _validateAddresses(Plan memory p) private view {
        (string[12] memory safeField, address[12] memory safeAccount) = safeRoles(p);
        for (uint256 i = 0; i < 12; i++) {
            _safe(p, safeField[i], safeAccount[i]);
        }
        _nonZero("recipients.founderReserved", p.recipients.founderReserved);
        if (p.treasuryGuardian == p.treasurySafe) {
            revert PlanGuardianNotIndependent(p.treasuryGuardian);
        }
        (string[13] memory field, address[13] memory account) = plannedAddresses(p);
        for (uint256 i = 0; i < PLANNED_ADDRESS_COUNT; i++) {
            for (uint256 j = i + 1; j < PLANNED_ADDRESS_COUNT; j++) {
                // forge-lint: disable-next-line(require-revert-in-loop)
                if (account[i] == account[j]) revert PlanAddressReused(field[j], field[i]);
            }
        }
    }

    /// @notice Every Safe the plan names, with its field name.
    function safeRoles(Plan memory p)
        internal
        pure
        returns (string[12] memory field, address[12] memory account)
    {
        Recipients memory r = p.recipients;
        field = [
            "recipients.founderUnrestricted",
            "vesting.investors.beneficiary",
            "vesting.strategicPartnerships.beneficiary",
            "treasury.safe",
            "treasury.guardian",
            "recipients.publicLaunch",
            "recipients.communityStaking",
            "recipients.ecosystemGrowth",
            "recipients.liquidity",
            "recipients.team",
            "recipients.earlyUsers",
            "recipients.grantsBugBounty"
        ];
        account = [
            r.founderUnrestricted,
            p.investors.beneficiary,
            p.strategicPartnerships.beneficiary,
            p.treasurySafe,
            p.treasuryGuardian,
            r.publicLaunch,
            r.communityStaking,
            r.ecosystemGrowth,
            r.liquidity,
            r.team,
            r.earlyUsers,
            r.grantsBugBounty
        ];
    }

    /// @notice Every address the plan names: the Safe roles, then the Founder Reserved holder.
    /// No two may be equal.
    function plannedAddresses(Plan memory p)
        internal
        pure
        returns (string[13] memory field, address[13] memory account)
    {
        (string[12] memory safeField, address[12] memory safeAccount) = safeRoles(p);
        for (uint256 i = 0; i < 12; i++) {
            field[i] = safeField[i];
            account[i] = safeAccount[i];
        }
        field[12] = "recipients.founderReserved";
        account[12] = p.recipients.founderReserved;
    }

    /// @dev Structural checks only: the durations themselves are not decided and are not
    /// asserted here. `ARLVestingWallet` enforces the same ordering on deployment.
    function _validateSchedule(string memory name, VestingPlan memory v) private pure {
        if (v.cliffStart == 0) revert PlanInvalidSchedule(string.concat(name, " start is zero"));
        if (v.cliffEnd < v.cliffStart) {
            revert PlanInvalidSchedule(string.concat(name, " cliff end is before its start"));
        }
        if (v.vestingEnd <= v.cliffEnd) {
            revert PlanInvalidSchedule(string.concat(name, " vesting end is not after cliff end"));
        }
    }

    function _vesting(string memory json, string memory key)
        private
        pure
        returns (VestingPlan memory v)
    {
        v.beneficiary = VM.parseJsonAddress(json, string.concat(key, ".beneficiary"));
        v.cliffStart = _u64(VM.parseJsonUint(json, string.concat(key, ".cliffStart")));
        v.cliffEnd = _u64(VM.parseJsonUint(json, string.concat(key, ".cliffEnd")));
        v.vestingEnd = _u64(VM.parseJsonUint(json, string.concat(key, ".vestingEnd")));
    }

    function _keyCount(string memory json, string memory key, string memory field, uint256 want)
        private
        pure
    {
        uint256 count = VM.parseJsonKeys(json, key).length;
        if (count != want) revert PlanUnexpectedKeys(field, count, want);
    }

    function _allocation(string memory field, uint256 planned, uint256 approved) private pure {
        if (planned != approved) revert PlanAllocationMismatch(field, planned, approved);
    }

    function _nonZero(string memory field, address account) private pure {
        if (account == address(0)) revert PlanZeroAddress(field);
    }

    /// @dev Safes must be deployed contracts except on local Anvil.
    function _safe(Plan memory p, string memory field, address account) private view {
        _nonZero(field, account);
        if (p.requireRecipientCode && account.code.length == 0) {
            revert PlanRecipientHasNoCode(field, account);
        }
    }

    function _u64(uint256 value) private pure returns (uint64) {
        if (value > type(uint64).max) revert PlanInvalidSchedule("timestamp exceeds uint64");
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(value);
    }
}
