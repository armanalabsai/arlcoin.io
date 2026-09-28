// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Vm} from "forge-std/Vm.sol";

import {DateTime} from "solidity-datetime/DateTime.sol";

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

/// @notice A deployment plan, as produced by `packages/deploy` (schema `arl-deploy-plan/4`).
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
    /// @dev Safe v1.5.0 singletons the plan's Safes may point to. Off local Anvil these must be
    /// the canonical singletons (`safe-global/safe-deployments`).
    address[] safeSingletons;
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

    /// @dev Approved schedule (economic specification section 4.1): 0% at TGE, a 12-month
    /// cliff, then 36 months linear, in calendar months. Every plan must match it exactly.
    uint256 internal constant VESTING_CLIFF_MONTHS = 12;
    uint256 internal constant VESTING_LINEAR_MONTHS = 36;

    /// @dev The durations are approved and enforced, but the vesting start (TGE) of the
    /// investor and strategic partnership wallets is not confirmed (TBD). Until it is, no plan
    /// may target a chain other than local Anvil.
    bool internal constant VESTING_SCHEDULES_APPROVED = false;

    /// @dev The custody of the Founder Reserved tranche (100,000 ARL) is not decided (TBD).
    /// Until it is approved and recorded here, no plan may target a chain other than local
    /// Anvil. Local rehearsals use a placeholder address that is not a custody decision.
    bool internal constant FOUNDER_RESERVE_CUSTODY_APPROVED = false;

    /// @dev Plans of any other schema, including `arl-deploy-plan/2` with its founder vesting
    /// wallet and `arl-deploy-plan/3` without Safe singletons, are rejected rather than
    /// reinterpreted.
    string internal constant PLAN_SCHEMA = "arl-deploy-plan/4";

    /// @dev Canonical Safe v1.5.0 deployments, from the npm package safe-deployments 1.37.63
    /// (MIT, safe-global). A test in `packages/deploy` fails if these differ from that package
    /// or from the official safe-smart-account 1.5.0 build.
    address internal constant SAFE_SINGLETON_V150 = 0xFf51A5898e281Db6DfC7855790607438dF2ca44b;
    address internal constant SAFE_L2_SINGLETON_V150 = 0xEdd160fEBBD92E350D4D398fb636302fccd67C7e;
    bytes32 internal constant SAFE_SINGLETON_V150_CODEHASH =
        0xdda019cbd7c867a533a2a86e5c53434fdc50b13122b5a5ddb4a8df61b31c20f2;
    bytes32 internal constant SAFE_L2_SINGLETON_V150_CODEHASH =
        0x180193227186ccb85316c94db1f0d156ed932b14712cfaac78901899178572dc;
    /// @dev Runtime code hash of `SafeProxy` v1.5.0. The proxy has no immutables; its singleton
    /// is stored in slot 0, so every genuine proxy has this exact code.
    bytes32 internal constant SAFE_PROXY_V150_CODEHASH =
        0x4e381985ca68b3e5d27b4425fa581c19cf33146d3f887a3cfca96f55528ea46f;

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
    error PlanSafeSingletonsMissing();
    error PlanSafeSingletonNotCanonical(address singleton);
    error PlanNotASafe(string field, address account);

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
        _keyCount(json, ".safe", "safe", 1);

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

        p.safeSingletons = VM.parseJsonAddressArray(json, ".safe.singletons");

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
        _validateSafes(p);
        validateSchedule("investors", p.investors);
        validateSchedule("strategicPartnerships", p.strategicPartnerships);
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

    /// @dev Where code is required (every chain except local Anvil), every Safe role must be a
    /// genuine Safe v1.5.0 proxy of an allowed singleton, so a contract that merely has code
    /// cannot stand in for a Safe. The Founder Reserved holder is not a Safe role: its custody is
    /// TBD.
    function _validateSafes(Plan memory p) private view {
        if (!p.requireRecipientCode) return;
        if (p.safeSingletons.length == 0) revert PlanSafeSingletonsMissing();
        for (uint256 i = 0; i < p.safeSingletons.length; i++) {
            if (!singletonAllowed(
                    p.chainId,
                    p.safeSingletons[i],
                    SAFE_SINGLETON_V150_CODEHASH,
                    SAFE_L2_SINGLETON_V150_CODEHASH
                )) {
                // forge-lint: disable-next-line(require-revert-in-loop)
                revert PlanSafeSingletonNotCanonical(p.safeSingletons[i]);
            }
        }
        (string[12] memory field, address[12] memory account) = safeRoles(p);
        for (uint256 i = 0; i < 12; i++) {
            if (!isSafeProxy(account[i], p.safeSingletons, SAFE_PROXY_V150_CODEHASH)) {
                // forge-lint: disable-next-line(require-revert-in-loop)
                revert PlanNotASafe(field[i], account[i]);
            }
        }
    }

    /// @notice True if `singleton` may back the plan's Safes. Off local Anvil it must be one of
    /// the two canonical Safe v1.5.0 singletons, with the expected code. On local Anvil a
    /// rehearsal deploys its own singleton, so any address is accepted there. The code hashes are
    /// parameters only so tests can exercise each branch; `validate` passes the constants above.
    function singletonAllowed(
        uint256 chainId,
        address singleton,
        bytes32 safeCodeHash,
        bytes32 safeL2CodeHash
    ) internal view returns (bool) {
        if (chainId == LOCAL_CHAIN_ID) return true;
        return (singleton == SAFE_SINGLETON_V150 && singleton.codehash == safeCodeHash)
            || (singleton == SAFE_L2_SINGLETON_V150 && singleton.codehash == safeL2CodeHash);
    }

    /// @notice True if `account` runs the Safe v1.5.0 proxy code and points (slot 0) to one of
    /// `singletons`. The proxy code hash is a parameter only so tests can exercise each branch.
    function isSafeProxy(address account, address[] memory singletons, bytes32 proxyCodeHash)
        internal
        view
        returns (bool)
    {
        if (account.codehash != proxyCodeHash) return false;
        address singleton = address(uint160(uint256(VM.load(account, bytes32(0)))));
        for (uint256 i = 0; i < singletons.length; i++) {
            if (singleton == singletons[i]) return true;
        }
        return false;
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

    /// @notice Reverts unless the schedule is ordered (as `ARLVestingWallet` also enforces) and
    /// has exactly the approved durations: the cliff ends 12 calendar months after the start,
    /// and linear vesting ends 36 calendar months after the cliff. Calendar-month arithmetic is
    /// `DateTime.addMonths` from solidity-datetime (MIT), which keeps the time of day.
    function validateSchedule(string memory name, VestingPlan memory v) internal pure {
        if (v.cliffStart == 0) revert PlanInvalidSchedule(string.concat(name, " start is zero"));
        if (v.cliffEnd < v.cliffStart) {
            revert PlanInvalidSchedule(string.concat(name, " cliff end is before its start"));
        }
        if (v.vestingEnd <= v.cliffEnd) {
            revert PlanInvalidSchedule(string.concat(name, " vesting end is not after cliff end"));
        }
        if (v.cliffEnd != DateTime.addMonths(v.cliffStart, VESTING_CLIFF_MONTHS)) {
            revert PlanInvalidSchedule(string.concat(name, " cliff is not 12 calendar months"));
        }
        if (v.vestingEnd != DateTime.addMonths(v.cliffEnd, VESTING_LINEAR_MONTHS)) {
            revert PlanInvalidSchedule(string.concat(
                    name, " linear vesting is not 36 calendar months"
                ));
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
