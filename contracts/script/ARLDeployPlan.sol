// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Vm} from "forge-std/Vm.sol";

import {ARLAllocation} from "../src/ARLAllocation.sol";

/// @notice One allocation amount per recipient, in base units. Field order matches
/// `ARLToken.Recipients`.
struct Allocations {
    uint256 founder;
    uint256 ecosystemReserve;
    uint256 treasury;
    uint256 communityStaking;
    uint256 liquidity;
    uint256 strategicPartnerships;
    uint256 publicLaunch;
    uint256 grantsBugBounty;
    uint256 team;
    uint256 earlyUserRewards;
}

/// @notice Holders of the seven allocations that are minted directly to a multisig.
struct Recipients {
    address communityStaking;
    address liquidity;
    address strategicPartnerships;
    address publicLaunch;
    address grantsBugBounty;
    address team;
    address earlyUserRewards;
}

/// @notice A deployment plan, as produced by `packages/deploy` (schema `arl-deploy-plan/1`).
struct Plan {
    uint256 chainId;
    bool requireRecipientCode;
    uint256 maxSupply;
    Allocations allocations;
    address founderBeneficiary;
    uint64 founderCliffStart;
    uint64 founderCliffEnd;
    uint64 founderVestingEnd;
    address reserveBeneficiary;
    uint64 reserveStart;
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

    /// @dev Anvil's default chain ID; the only chain where recipients may lack code.
    uint256 internal constant LOCAL_CHAIN_ID = 31337;

    // 24 and 36 calendar months, whatever the leap years, measured in days.
    uint256 internal constant CLIFF_MIN = 730 days;
    uint256 internal constant CLIFF_MAX = 731 days;
    uint256 internal constant LINEAR_MIN = 1095 days;
    uint256 internal constant LINEAR_MAX = 1096 days;

    /// @dev Mirrors `ARLTimelock.MIN_DELAY_FLOOR` (Solidity cannot read another contract's
    /// constant by type). `ARLDeployPlanTest` asserts they are equal, and the timelock
    /// constructor enforces its own floor regardless.
    uint256 internal constant TIMELOCK_DELAY_FLOOR = 48 hours;

    error PlanMissingChainId();
    error PlanChainMismatch(uint256 planChainId, uint256 actualChainId);
    error PlanRecipientCodeRequired(uint256 chainId);
    error PlanZeroAddress(string field);
    error PlanRecipientHasNoCode(string field, address account);
    error PlanAllocationMismatch(string field, uint256 planned, uint256 approved);
    error PlanSupplyMismatch(uint256 planned, uint256 approved);
    error PlanInvalidSchedule(string reason);
    error PlanDelayBelowFloor(uint256 delay, uint256 floor);
    error PlanGuardianNotIndependent(address guardian);

    /// @notice Parses a plan JSON document. Reverts if any field is missing or malformed.
    function load(string memory json) internal pure returns (Plan memory p) {
        p.chainId = VM.parseJsonUint(json, ".chainId");
        p.requireRecipientCode = VM.parseJsonBool(json, ".requireRecipientCode");
        p.maxSupply = VM.parseJsonUint(json, ".maxSupply");

        p.allocations = Allocations({
            founder: VM.parseJsonUint(json, ".allocations.founder"),
            ecosystemReserve: VM.parseJsonUint(json, ".allocations.ecosystemReserve"),
            treasury: VM.parseJsonUint(json, ".allocations.treasury"),
            communityStaking: VM.parseJsonUint(json, ".allocations.communityStaking"),
            liquidity: VM.parseJsonUint(json, ".allocations.liquidity"),
            strategicPartnerships: VM.parseJsonUint(json, ".allocations.strategicPartnerships"),
            publicLaunch: VM.parseJsonUint(json, ".allocations.publicLaunch"),
            grantsBugBounty: VM.parseJsonUint(json, ".allocations.grantsBugBounty"),
            team: VM.parseJsonUint(json, ".allocations.team"),
            earlyUserRewards: VM.parseJsonUint(json, ".allocations.earlyUserRewards")
        });

        p.founderBeneficiary = VM.parseJsonAddress(json, ".founder.beneficiary");
        p.founderCliffStart = _u64(VM.parseJsonUint(json, ".founder.cliffStart"));
        p.founderCliffEnd = _u64(VM.parseJsonUint(json, ".founder.cliffEnd"));
        p.founderVestingEnd = _u64(VM.parseJsonUint(json, ".founder.vestingEnd"));

        p.reserveBeneficiary = VM.parseJsonAddress(json, ".ecosystemReserve.beneficiary");
        p.reserveStart = _u64(VM.parseJsonUint(json, ".ecosystemReserve.start"));

        p.treasurySafe = VM.parseJsonAddress(json, ".treasury.safe");
        p.treasuryGuardian = VM.parseJsonAddress(json, ".treasury.guardian");
        p.minDelay = VM.parseJsonUint(json, ".treasury.minDelay");

        p.recipients = Recipients({
            communityStaking: VM.parseJsonAddress(json, ".recipients.communityStaking"),
            liquidity: VM.parseJsonAddress(json, ".recipients.liquidity"),
            strategicPartnerships: VM.parseJsonAddress(json, ".recipients.strategicPartnerships"),
            publicLaunch: VM.parseJsonAddress(json, ".recipients.publicLaunch"),
            grantsBugBounty: VM.parseJsonAddress(json, ".recipients.grantsBugBounty"),
            team: VM.parseJsonAddress(json, ".recipients.team"),
            earlyUserRewards: VM.parseJsonAddress(json, ".recipients.earlyUserRewards")
        });
    }

    /// @notice Reverts unless the plan matches the current chain and every approved rule.
    function validate(Plan memory p) internal view {
        _validateChain(p);
        _validateAllocations(p);
        _validateAddresses(p);
        _validateSchedules(p);
        if (p.minDelay < TIMELOCK_DELAY_FLOOR) {
            revert PlanDelayBelowFloor(p.minDelay, TIMELOCK_DELAY_FLOOR);
        }
    }

    function _validateChain(Plan memory p) private view {
        if (p.chainId == 0) revert PlanMissingChainId();
        if (p.chainId != block.chainid) revert PlanChainMismatch(p.chainId, block.chainid);
        if (!p.requireRecipientCode && p.chainId != LOCAL_CHAIN_ID) {
            revert PlanRecipientCodeRequired(p.chainId);
        }
    }

    function _validateAllocations(Plan memory p) private pure {
        Allocations memory a = p.allocations;
        _allocation("founder", a.founder, ARLAllocation.FOUNDER);
        _allocation("ecosystemReserve", a.ecosystemReserve, ARLAllocation.ECOSYSTEM_RESERVE);
        _allocation("treasury", a.treasury, ARLAllocation.TREASURY);
        _allocation("communityStaking", a.communityStaking, ARLAllocation.COMMUNITY_STAKING);
        _allocation("liquidity", a.liquidity, ARLAllocation.LIQUIDITY);
        _allocation(
            "strategicPartnerships", a.strategicPartnerships, ARLAllocation.STRATEGIC_PARTNERSHIPS
        );
        _allocation("publicLaunch", a.publicLaunch, ARLAllocation.PUBLIC_LAUNCH);
        _allocation("grantsBugBounty", a.grantsBugBounty, ARLAllocation.GRANTS_BUG_BOUNTY);
        _allocation("team", a.team, ARLAllocation.TEAM);
        _allocation("earlyUserRewards", a.earlyUserRewards, ARLAllocation.EARLY_USER_REWARDS);

        uint256 total = a.founder + a.ecosystemReserve + a.treasury + a.communityStaking
            + a.liquidity + a.strategicPartnerships + a.publicLaunch + a.grantsBugBounty + a.team
            + a.earlyUserRewards;
        if (total != ARLAllocation.MAX_SUPPLY) {
            revert PlanSupplyMismatch(total, ARLAllocation.MAX_SUPPLY);
        }
        if (p.maxSupply != ARLAllocation.MAX_SUPPLY) {
            revert PlanSupplyMismatch(p.maxSupply, ARLAllocation.MAX_SUPPLY);
        }
    }

    function _validateAddresses(Plan memory p) private view {
        _nonZero("founderBeneficiary", p.founderBeneficiary);
        _safe(p, "ecosystemReserveBeneficiary", p.reserveBeneficiary);
        _safe(p, "treasury.safe", p.treasurySafe);
        _safe(p, "treasury.guardian", p.treasuryGuardian);
        // The guardian is an independent brake: it must not be the Safe it can cancel.
        if (p.treasuryGuardian == p.treasurySafe) {
            revert PlanGuardianNotIndependent(p.treasuryGuardian);
        }
        Recipients memory r = p.recipients;
        _safe(p, "recipients.communityStaking", r.communityStaking);
        _safe(p, "recipients.liquidity", r.liquidity);
        _safe(p, "recipients.strategicPartnerships", r.strategicPartnerships);
        _safe(p, "recipients.publicLaunch", r.publicLaunch);
        _safe(p, "recipients.grantsBugBounty", r.grantsBugBounty);
        _safe(p, "recipients.team", r.team);
        _safe(p, "recipients.earlyUserRewards", r.earlyUserRewards);
    }

    function _validateSchedules(Plan memory p) private pure {
        if (p.founderCliffStart == 0) revert PlanInvalidSchedule("founder cliff start is zero");
        if (p.founderCliffStart >= p.founderCliffEnd) {
            revert PlanInvalidSchedule("founder cliff end is not after cliff start");
        }
        if (p.founderCliffEnd >= p.founderVestingEnd) {
            revert PlanInvalidSchedule("founder vesting end is not after cliff end");
        }
        uint256 cliff = p.founderCliffEnd - p.founderCliffStart;
        if (cliff < CLIFF_MIN || cliff > CLIFF_MAX) {
            revert PlanInvalidSchedule("founder cliff is not 24 calendar months");
        }
        uint256 linear = p.founderVestingEnd - p.founderCliffEnd;
        if (linear < LINEAR_MIN || linear > LINEAR_MAX) {
            revert PlanInvalidSchedule("founder linear vesting is not 36 calendar months");
        }
        if (p.reserveStart == 0) revert PlanInvalidSchedule("ecosystem reserve start is zero");
        if (uint256(p.reserveStart) + ARLAllocation.ECOSYSTEM_RESERVE_DURATION > type(uint64).max) {
            revert PlanInvalidSchedule("ecosystem reserve end overflows uint64");
        }
    }

    function _allocation(string memory field, uint256 planned, uint256 approved) private pure {
        if (planned != approved) revert PlanAllocationMismatch(field, planned, approved);
    }

    function _nonZero(string memory field, address account) private pure {
        if (account == address(0)) revert PlanZeroAddress(field);
    }

    /// @dev Multisig recipients must be deployed contracts except on local Anvil.
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
