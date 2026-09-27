// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";

import {ARLAllocation} from "../../src/ARLAllocation.sol";
import {ARLTimelock} from "../../src/ARLTimelock.sol";
import {ARLToken} from "../../src/ARLToken.sol";
import {ARLVestingWallet} from "../../src/ARLVestingWallet.sol";
import {ARLDeployPlan, Allocations, Plan, Recipients} from "../../script/ARLDeployPlan.sol";
import {ARLDeployer, Deployment} from "../../script/ARLDeployer.sol";
import {ARLVerify} from "../../script/ARLVerify.sol";

/// @dev External wrappers so `vm.expectRevert` can observe reverts from internal library code.
contract ARLDeployHarness {
    function load(string memory json) external pure returns (Plan memory) {
        return ARLDeployPlan.load(json);
    }

    function validate(Plan memory p) external view {
        ARLDeployPlan.validate(p);
    }

    function deploy(Plan memory p) external returns (Deployment memory) {
        return ARLDeployer.deploy(p, address(this));
    }

    function verify(Plan memory p, Deployment memory d) external view {
        ARLVerify.verify(p, d);
    }
}

contract ARLDeployTest is Test {
    uint64 internal constant LAUNCH = 1_798_761_600; // 2027-01-01T00:00:00Z
    uint64 internal constant CLIFF_END = 1_861_920_000; // 2029-01-01T00:00:00Z
    uint64 internal constant VESTING_END = 1_956_528_000; // 2032-01-01T00:00:00Z

    ARLDeployHarness internal h;

    function setUp() public {
        h = new ARLDeployHarness();
    }

    function _plan() internal returns (Plan memory p) {
        p.chainId = block.chainid;
        p.requireRecipientCode = false;
        p.maxSupply = ARLAllocation.MAX_SUPPLY;
        p.allocations = Allocations({
            founder: ARLAllocation.FOUNDER,
            ecosystemReserve: ARLAllocation.ECOSYSTEM_RESERVE,
            treasury: ARLAllocation.TREASURY,
            communityStaking: ARLAllocation.COMMUNITY_STAKING,
            liquidity: ARLAllocation.LIQUIDITY,
            strategicPartnerships: ARLAllocation.STRATEGIC_PARTNERSHIPS,
            publicLaunch: ARLAllocation.PUBLIC_LAUNCH,
            grantsBugBounty: ARLAllocation.GRANTS_BUG_BOUNTY,
            team: ARLAllocation.TEAM,
            earlyUserRewards: ARLAllocation.EARLY_USER_REWARDS
        });
        p.founderBeneficiary = makeAddr("founder");
        p.founderCliffStart = LAUNCH;
        p.founderCliffEnd = CLIFF_END;
        p.founderVestingEnd = VESTING_END;
        p.reserveBeneficiary = makeAddr("ecosystemSafe");
        p.reserveStart = LAUNCH;
        p.treasurySafe = makeAddr("treasurySafe");
        p.treasuryGuardian = makeAddr("guardianSafe");
        p.minDelay = 48 hours;
        p.recipients = Recipients({
            communityStaking: makeAddr("communitySafe"),
            liquidity: makeAddr("liquiditySafe"),
            strategicPartnerships: makeAddr("partnershipsSafe"),
            publicLaunch: makeAddr("launchSafe"),
            grantsBugBounty: makeAddr("grantsSafe"),
            team: makeAddr("teamPoolSafe"),
            earlyUserRewards: makeAddr("rewardsSafe")
        });
    }

    // ------------------------------------------------------------------ happy path

    function test_ValidPlanDeploysAndVerifies() public {
        Plan memory p = _plan();
        h.validate(p);
        Deployment memory d = h.deploy(p);
        h.verify(p, d);
        assertEq(d.token.totalSupply(), 21_000_000e18);
        assertEq(d.token.balanceOf(address(d.timelock)), 3_000_000e18);
        assertEq(d.reserveVesting.duration(), 1830 days);
        assertEq(d.founderVesting.cliffEnd(), CLIFF_END);
    }

    function test_SharedRecipientVerifies() public {
        Plan memory p = _plan();
        p.recipients.liquidity = p.recipients.communityStaking;
        h.verify(p, h.deploy(p));
    }

    function test_SafesWithCodeVerifyWhenRequired() public {
        Plan memory p = _plan();
        p.requireRecipientCode = true;
        _giveCode(p);
        h.validate(p);
        h.verify(p, h.deploy(p));
    }

    function test_LoadParsesPlannerOutput() public view {
        // Shape and values produced by `packages/deploy` for the local config (trimmed).
        string memory head = string.concat(
            '{"schema":"arl-deploy-plan/1","chainId":31337,"requireRecipientCode":false,',
            '"maxSupply":"21000000000000000000000000","allocations":{',
            '"founder":"2100000000000000000000000","ecosystemReserve":"7000000000000000000000000",',
            '"treasury":"3000000000000000000000000","communityStaking":"3000000000000000000000000",',
            '"liquidity":"2000000000000000000000000","strategicPartnerships":"1500000000000000000000000",',
            '"publicLaunch":"1000000000000000000000000","grantsBugBounty":"400000000000000000000000",'
        );
        string memory mid = string.concat(
            '"team":"500000000000000000000000","earlyUserRewards":"500000000000000000000000"},',
            '"founder":{"beneficiary":"0x1F67caa874DDec60E290e27cce758f01Bd53c380",',
            '"cliffStart":1798761600,"cliffEnd":1861920000,"vestingEnd":1956528000},',
            '"ecosystemReserve":{"beneficiary":"0x61042dF2f9DfD50AFC0734F5CB4da6E55bE6d09d",',
            '"start":1798761600},"treasury":{"safe":"0xCbA140fcD82caf116be04c2a478A0e10b55202F9",',
            '"guardian":"0x0c0bA8A2630B2108D5aF98B64fA89eF1BDb7C9d4","minDelay":172800},"recipients":{"communityStaking":"0x86d861EBe84C3F6D4F374c9640c5b89549C724A8",'
        );
        string memory tail = string.concat(
            '"liquidity":"0x179DaF8783071e3868Fb00208B3529F48E544AF8",',
            '"strategicPartnerships":"0x5F611FC6df7B0e0326A6B10b135A15DdF8667c2a",',
            '"publicLaunch":"0x1E0C4aef807F25F0F79146f3A9646e75954E0E0d",',
            '"grantsBugBounty":"0x2F050E3aAFBFb59BD438F97c4D280D0d38F411c4",',
            '"team":"0xB5C15dcF9624e2137D772f72fCB1020B6Cba1455",',
            '"earlyUserRewards":"0x480F68E166456e8a00584F003575d6975a8f2aFB"}}'
        );
        string memory json = string.concat(head, mid, tail);
        Plan memory p = h.load(json);
        assertEq(p.chainId, 31337);
        assertEq(p.allocations.founder, ARLAllocation.FOUNDER);
        assertEq(p.allocations.earlyUserRewards, ARLAllocation.EARLY_USER_REWARDS);
        assertEq(p.founderCliffEnd, CLIFF_END);
        assertEq(p.minDelay, 48 hours);
        assertEq(p.treasuryGuardian, 0x0c0bA8A2630B2108D5aF98B64fA89eF1BDb7C9d4);
        assertEq(p.recipients.team, 0xB5C15dcF9624e2137D772f72fCB1020B6Cba1455);
        h.validate(p);
    }

    function test_RevertWhen_PlanFieldMissing() public {
        vm.expectRevert();
        h.load('{"chainId":31337}');
    }

    // ------------------------------------------------------------------ constant guards

    function test_DelayFloorMatchesTimelock() public {
        address[] memory safe = new address[](1);
        safe[0] = makeAddr("safe");
        ARLTimelock tl = new ARLTimelock(48 hours, safe, safe, makeAddr("guardian"));
        assertEq(ARLDeployPlan.TIMELOCK_DELAY_FLOOR, tl.MIN_DELAY_FLOOR());
    }

    function test_ReserveDurationMatchesApproval() public pure {
        assertEq(ARLAllocation.ECOSYSTEM_RESERVE_DURATION, ARLVerify.APPROVED_RESERVE_DURATION);
        assertEq(ARLVerify.APPROVED_RESERVE_DURATION, 1830 days);
    }

    // ------------------------------------------------------------------ validation (fail closed)

    function test_RevertWhen_ChainIdMissing() public {
        Plan memory p = _plan();
        p.chainId = 0;
        vm.expectRevert(ARLDeployPlan.PlanMissingChainId.selector);
        h.validate(p);
    }

    function test_RevertWhen_ChainIdMismatch() public {
        Plan memory p = _plan();
        p.chainId = 1;
        vm.expectRevert(
            abi.encodeWithSelector(ARLDeployPlan.PlanChainMismatch.selector, 1, block.chainid)
        );
        h.validate(p);
    }

    function test_RevertWhen_CodeChecksDisabledOffLocal() public {
        vm.chainId(11155111);
        Plan memory p = _plan();
        vm.expectRevert(
            abi.encodeWithSelector(ARLDeployPlan.PlanRecipientCodeRequired.selector, 11155111)
        );
        h.validate(p);
    }

    function test_RevertWhen_RecipientHasNoCode() public {
        Plan memory p = _plan();
        p.requireRecipientCode = true;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanRecipientHasNoCode.selector,
                "ecosystemReserveBeneficiary",
                p.reserveBeneficiary
            )
        );
        h.validate(p);
    }

    function test_RevertWhen_ZeroAddresses() public {
        Plan memory p = _plan();
        p.treasurySafe = address(0);
        _expectZero("treasury.safe");
        h.validate(p);

        p = _plan();
        p.treasuryGuardian = address(0);
        _expectZero("treasury.guardian");
        h.validate(p);

        p = _plan();
        p.founderBeneficiary = address(0);
        _expectZero("founderBeneficiary");
        h.validate(p);

        p = _plan();
        p.recipients.earlyUserRewards = address(0);
        _expectZero("recipients.earlyUserRewards");
        h.validate(p);
    }

    function test_RevertWhen_GuardianIsTheTreasurySafe() public {
        Plan memory p = _plan();
        p.treasuryGuardian = p.treasurySafe;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanGuardianNotIndependent.selector, p.treasurySafe
            )
        );
        h.validate(p);
    }

    function test_RevertWhen_GuardianHasNoCodeWhenRequired() public {
        Plan memory p = _plan();
        p.requireRecipientCode = true;
        _giveCode(p);
        vm.etch(p.treasuryGuardian, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanRecipientHasNoCode.selector,
                "treasury.guardian",
                p.treasuryGuardian
            )
        );
        h.validate(p);
    }

    function test_RevertWhen_AllocationMismatch() public {
        Plan memory p = _plan();
        p.allocations.team += 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanAllocationMismatch.selector,
                "team",
                ARLAllocation.TEAM + 1,
                ARLAllocation.TEAM
            )
        );
        h.validate(p);
    }

    function test_RevertWhen_MaxSupplyMismatch() public {
        Plan memory p = _plan();
        p.maxSupply = 22_000_000e18;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanSupplyMismatch.selector, 22_000_000e18, ARLAllocation.MAX_SUPPLY
            )
        );
        h.validate(p);
    }

    function test_RevertWhen_DelayBelowFloor() public {
        Plan memory p = _plan();
        p.minDelay = 48 hours - 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanDelayBelowFloor.selector, 48 hours - 1, 48 hours
            )
        );
        h.validate(p);
    }

    function test_RevertWhen_ScheduleOrderingInvalid() public {
        Plan memory p = _plan();
        p.founderCliffStart = 0;
        _expectSchedule("founder cliff start is zero");
        h.validate(p);

        p = _plan();
        p.founderCliffEnd = p.founderCliffStart;
        _expectSchedule("founder cliff end is not after cliff start");
        h.validate(p);

        p = _plan();
        p.founderVestingEnd = p.founderCliffEnd;
        _expectSchedule("founder vesting end is not after cliff end");
        h.validate(p);

        p = _plan();
        p.reserveStart = 0;
        _expectSchedule("ecosystem reserve start is zero");
        h.validate(p);
    }

    function test_RevertWhen_MonthsApproximatedAsThirtyDays() public {
        Plan memory p = _plan();
        p.founderCliffEnd = p.founderCliffStart + 24 * 30 days;
        _expectSchedule("founder cliff is not 24 calendar months");
        h.validate(p);

        p = _plan();
        p.founderVestingEnd = p.founderCliffEnd + 36 * 30 days;
        _expectSchedule("founder linear vesting is not 36 calendar months");
        h.validate(p);
    }

    function testFuzz_CliffLengthMustBe24CalendarMonths(uint64 cliff) public {
        cliff = uint64(bound(cliff, 1, 2000 days));
        Plan memory p = _plan();
        p.founderCliffEnd = p.founderCliffStart + cliff;
        p.founderVestingEnd = p.founderCliffEnd + 1095 days;
        if (cliff < 730 days || cliff > 731 days) {
            _expectSchedule("founder cliff is not 24 calendar months");
        }
        h.validate(p);
    }

    function testFuzz_DelayMustBeAtLeast48Hours(uint256 delay) public {
        delay = bound(delay, 0, 30 days);
        Plan memory p = _plan();
        p.minDelay = delay;
        if (delay < 48 hours) vm.expectRevert();
        h.validate(p);
    }

    // ------------------------------------------------------------------ verification

    function test_RevertWhen_VerifyWrongRecipient() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        p.recipients.liquidity = makeAddr("attacker");
        vm.expectRevert();
        h.verify(p, d);
    }

    function test_RevertWhen_VerifyWrongTimestamp() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        p.founderVestingEnd += 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLVerify.VerifyUintMismatch.selector,
                "founder vesting end",
                uint256(VESTING_END) + 1,
                uint256(VESTING_END)
            )
        );
        h.verify(p, d);
    }

    function test_RevertWhen_VerifyWrongBeneficiary() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        address planned = p.reserveBeneficiary;
        p.reserveBeneficiary = makeAddr("other");
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLVerify.VerifyAddressMismatch.selector,
                "reserve beneficiary",
                p.reserveBeneficiary,
                planned
            )
        );
        h.verify(p, d);
    }

    function test_RevertWhen_VerifyOnOtherChain() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        vm.chainId(1);
        vm.expectRevert();
        h.verify(p, d);
    }

    /// @dev An address(0) executor makes execution open to anyone. The constructor refuses it
    /// (L-3); the verifier still checks it in case a role is granted later through the delay.
    function test_RevertWhen_TimelockBuiltWithOpenExecutorRole() public {
        address[] memory proposers = new address[](1);
        proposers[0] = makeAddr("treasurySafe");
        address[] memory executors = new address[](2);
        executors[0] = proposers[0];
        executors[1] = address(0);
        vm.expectRevert(ARLTimelock.ARLTimelockZeroAddress.selector);
        new ARLTimelock(48 hours, proposers, executors, makeAddr("guardianSafe"));
    }

    function test_RevertWhen_VerifyOpenExecutorRole() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        bytes32 executor = d.timelock.EXECUTOR_ROLE();
        vm.prank(address(d.timelock));
        d.timelock.grantRole(executor, address(0));
        vm.expectRevert(
            abi.encodeWithSelector(ARLVerify.VerifyFailed.selector, "zero address is not executor")
        );
        h.verify(p, d);
    }

    function test_RevertWhen_VerifyWrongGuardian() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        p.treasuryGuardian = makeAddr("otherGuardian");
        vm.expectRevert(
            abi.encodeWithSelector(ARLVerify.VerifyFailed.selector, "guardian is canceller")
        );
        h.verify(p, d);
    }

    function test_RevertWhen_VerifyGuardianIsTheSafe() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        p.treasuryGuardian = p.treasurySafe;
        vm.expectRevert(
            abi.encodeWithSelector(ARLVerify.VerifyFailed.selector, "guardian is independent")
        );
        h.verify(p, d);
    }

    /// @dev A guardian granted more than CANCELLER_ROLE (possible only through a scheduled role
    /// change) must fail verification.
    function test_RevertWhen_VerifyGuardianHasExtraRole() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        bytes32 proposer = d.timelock.PROPOSER_ROLE();
        vm.prank(address(d.timelock));
        d.timelock.grantRole(proposer, p.treasuryGuardian);
        vm.expectRevert(
            abi.encodeWithSelector(ARLVerify.VerifyFailed.selector, "guardian is not proposer")
        );
        h.verify(p, d);
    }

    function test_RevertWhen_VerifyTokenMissing() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        d.token = ARLToken(makeAddr("noCode"));
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLVerify.VerifyAddressMismatch.selector, "token", address(d.token), address(0)
            )
        );
        h.verify(p, d);
    }

    function test_RevertWhen_VerifyAfterTokensMoved() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        vm.prank(p.recipients.liquidity);
        d.token.transfer(makeAddr("elsewhere"), 1);
        vm.expectRevert();
        h.verify(p, d);
    }

    // ------------------------------------------------------------------ helpers

    function _giveCode(Plan memory p) internal {
        address[10] memory safes = [
            p.treasurySafe,
            p.treasuryGuardian,
            p.reserveBeneficiary,
            p.recipients.communityStaking,
            p.recipients.liquidity,
            p.recipients.strategicPartnerships,
            p.recipients.publicLaunch,
            p.recipients.grantsBugBounty,
            p.recipients.team,
            p.recipients.earlyUserRewards
        ];
        for (uint256 i = 0; i < safes.length; i++) {
            vm.etch(safes[i], hex"00");
        }
    }

    function _expectZero(string memory field) internal {
        vm.expectRevert(abi.encodeWithSelector(ARLDeployPlan.PlanZeroAddress.selector, field));
    }

    function _expectSchedule(string memory reason) internal {
        vm.expectRevert(abi.encodeWithSelector(ARLDeployPlan.PlanInvalidSchedule.selector, reason));
    }
}
