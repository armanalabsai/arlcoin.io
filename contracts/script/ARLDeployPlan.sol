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

/// @notice Holders of the seven allocations that are minted directly to a dedicated Safe.
struct Recipients {
    address publicLaunch;
    address communityStaking;
    address ecosystemGrowth;
    address liquidity;
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

/// @notice A deployment plan, as produced by `packages/deploy` (schema `arl-deploy-plan/2`).
struct Plan {
    uint256 chainId;
    bool requireRecipientCode;
    uint256 maxSupply;
    Allocations allocations;
    VestingPlan founder;
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

    /// @dev The founder, investor and strategic partnership vesting schedules are not decided
    /// (TBD). Until they are approved and recorded here, no plan may target a chain other than
    /// local Anvil.
    bool internal constant VESTING_SCHEDULES_APPROVED = false;

    /// @dev Mirrors `ARLTimelock.MIN_DELAY_FLOOR` (Solidity cannot read another contract's
    /// constant by type). `ARLDeployPlanTest` asserts they are equal, and the timelock
    /// constructor enforces its own floor regardless.
    uint256 internal constant TIMELOCK_DELAY_FLOOR = 48 hours;

    uint256 internal constant ALLOCATION_COUNT = 11;
    uint256 internal constant SAFE_RECIPIENT_COUNT = 7;

    error PlanMissingChainId();
    error PlanChainMismatch(uint256 planChainId, uint256 actualChainId);
    error PlanRecipientCodeRequired(uint256 chainId);
    error PlanVestingScheduleNotApproved(uint256 chainId);
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

    /// @notice Parses a plan JSON document. Reverts if any field is missing or malformed, if a
    /// legacy allocation is present, or if a section has more or fewer entries than the model.
    function load(string memory json) internal view returns (Plan memory p) {
        if (VM.keyExistsJson(json, ".ecosystemReserve")) {
            revert PlanLegacyAllocation("ecosystemReserve");
        }
        if (VM.keyExistsJson(json, ".allocations.ecosystemReserve")) {
            revert PlanLegacyAllocation("allocations.ecosystemReserve");
        }
        _keyCount(json, ".allocations", "allocations", ALLOCATION_COUNT);
        _keyCount(json, ".recipients", "recipients", SAFE_RECIPIENT_COUNT);

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

        p.founder = _vesting(json, ".vesting.founder");
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
            team: VM.parseJsonAddress(json, ".recipients.team"),
            earlyUsers: VM.parseJsonAddress(json, ".recipients.earlyUsers"),
            grantsBugBounty: VM.parseJsonAddress(json, ".recipients.grantsBugBounty")
        });
    }

    /// @notice Reverts unless the plan matches the current chain and every approved rule.
    function validate(Plan memory p) internal view {
        _validateChain(p);
        _validateAllocations(p);
        _validateAddresses(p);
        _validateSchedule("founder", p.founder);
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
            if (!VESTING_SCHEDULES_APPROVED) revert PlanVestingScheduleNotApproved(p.chainId);
        }
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

    /// @dev Every Safe role is a dedicated Safe: non-zero, a contract off local Anvil, and not
    /// shared with any other role.
    function _validateAddresses(Plan memory p) private view {
        (string[12] memory field, address[12] memory account) = safeRoles(p);
        for (uint256 i = 0; i < 12; i++) {
            _safe(p, field[i], account[i]);
        }
        if (p.treasuryGuardian == p.treasurySafe) {
            revert PlanGuardianNotIndependent(p.treasuryGuardian);
        }
        for (uint256 i = 0; i < 12; i++) {
            for (uint256 j = i + 1; j < 12; j++) {
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
            "vesting.founder.beneficiary",
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
            p.founder.beneficiary,
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
