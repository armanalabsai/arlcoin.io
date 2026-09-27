// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";

import {ARLAllocation} from "../../src/ARLAllocation.sol";
import {ARLTimelock} from "../../src/ARLTimelock.sol";
import {ARLToken} from "../../src/ARLToken.sol";
import {
    ARLDeployPlan,
    Allocations,
    FounderTranches,
    Plan,
    Recipients,
    VestingPlan
} from "../../script/ARLDeployPlan.sol";
import {ARLDeployer, Deployment} from "../../script/ARLDeployer.sol";
import {ARLVerify} from "../../script/ARLVerify.sol";

/// @dev External wrappers so `vm.expectRevert` can observe reverts from internal library code.
contract ARLDeployHarness {
    function load(string memory json) external view returns (Plan memory) {
        return ARLDeployPlan.load(json);
    }

    function validate(Plan memory p) external view {
        ARLDeployPlan.validate(p);
    }

    function approvalGate(uint256 chainId, bool vestingApproved, bool reserveApproved)
        external
        pure
    {
        ARLDeployPlan.approvalGate(chainId, vestingApproved, reserveApproved);
    }

    function deploy(Plan memory p) external returns (Deployment memory) {
        return ARLDeployer.deploy(p, address(this));
    }

    function verify(Plan memory p, Deployment memory d) external view {
        ARLVerify.verify(p, d);
    }
}

/// @dev Vesting schedules here are test fixtures; the approved schedules are TBD.
contract ARLDeployTest is Test {
    uint64 internal constant START = 1_798_761_600; // 2027-01-01T00:00:00Z
    uint64 internal constant CLIFF_END = 1_830_297_600; // 2028-01-01T00:00:00Z
    uint64 internal constant VESTING_END = 1_893_456_000; // 2030-01-01T00:00:00Z

    ARLDeployHarness internal h;

    function setUp() public {
        h = new ARLDeployHarness();
    }

    function _plan() internal returns (Plan memory p) {
        p.chainId = block.chainid;
        p.requireRecipientCode = false;
        p.maxSupply = ARLAllocation.MAX_SUPPLY;
        p.allocations = Allocations({
            publicLaunch: ARLAllocation.PUBLIC_LAUNCH,
            communityStaking: ARLAllocation.COMMUNITY_STAKING,
            ecosystemGrowth: ARLAllocation.ECOSYSTEM_GROWTH,
            strategicPartnerships: ARLAllocation.STRATEGIC_PARTNERSHIPS,
            liquidity: ARLAllocation.LIQUIDITY,
            founder: ARLAllocation.FOUNDER,
            investors: ARLAllocation.INVESTORS,
            treasury: ARLAllocation.TREASURY,
            team: ARLAllocation.TEAM,
            earlyUsers: ARLAllocation.EARLY_USERS,
            grantsBugBounty: ARLAllocation.GRANTS_BUG_BOUNTY
        });
        p.founderTranches =
            FounderTranches(ARLAllocation.FOUNDER_UNRESTRICTED, ARLAllocation.FOUNDER_RESERVED);
        p.investors = VestingPlan(makeAddr("investorsSafe"), START, CLIFF_END, VESTING_END);
        p.strategicPartnerships =
            VestingPlan(makeAddr("partnershipsSafe"), START, START, VESTING_END);
        p.treasurySafe = makeAddr("treasurySafe");
        p.treasuryGuardian = makeAddr("guardianSafe");
        p.minDelay = 48 hours;
        p.recipients = Recipients({
            publicLaunch: makeAddr("launchSafe"),
            communityStaking: makeAddr("communitySafe"),
            ecosystemGrowth: makeAddr("growthSafe"),
            liquidity: makeAddr("liquiditySafe"),
            founderUnrestricted: makeAddr("founderUnrestrictedSafe"),
            founderReserved: makeAddr("founderReservedHolder"),
            team: makeAddr("teamPoolSafe"),
            earlyUsers: makeAddr("earlyUsersSafe"),
            grantsBugBounty: makeAddr("grantsSafe")
        });
    }

    // ------------------------------------------------------------------ happy path

    function test_ValidPlanDeploysAndVerifies() public {
        Plan memory p = _plan();
        h.validate(p);
        Deployment memory d = h.deploy(p);
        h.verify(p, d);
        assertEq(d.token.totalSupply(), 21_000_000e18);
        assertEq(d.token.balanceOf(address(d.timelock)), 1_000_000e18);
        assertEq(d.token.balanceOf(p.recipients.founderUnrestricted), 2_000_000e18);
        assertEq(d.token.balanceOf(p.recipients.founderReserved), 100_000e18);
        assertEq(d.token.balanceOf(address(d.investorsVesting)), 1_500_000e18);
        assertEq(d.token.balanceOf(address(d.partnershipsVesting)), 2_000_000e18);
        assertEq(d.token.balanceOf(p.recipients.publicLaunch), 5_000_000e18);
        assertEq(d.investorsVesting.cliffEnd(), CLIFF_END);
        assertEq(d.partnershipsVesting.owner(), p.strategicPartnerships.beneficiary);
    }

    /// @dev The Founder allocation is minted straight to the two planned addresses. Neither is
    /// a contract the deployer created, so neither can be a vesting wallet, and the Founder
    /// Unrestricted holder can move its whole tranche immediately.
    function test_NoFounderVestingWalletIsDeployed() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        h.verify(p, d);
        address[4] memory deployed = [
            address(d.token),
            address(d.investorsVesting),
            address(d.partnershipsVesting),
            address(d.timelock)
        ];
        for (uint256 i = 0; i < deployed.length; i++) {
            assertTrue(deployed[i] != p.recipients.founderUnrestricted);
            assertTrue(deployed[i] != p.recipients.founderReserved);
        }
        assertEq(p.recipients.founderUnrestricted.code.length, 0);
        assertEq(p.recipients.founderReserved.code.length, 0);

        vm.prank(p.recipients.founderUnrestricted);
        assertTrue(d.token.transfer(makeAddr("buyer"), ARLAllocation.FOUNDER_UNRESTRICTED));
        assertEq(d.token.balanceOf(p.recipients.founderUnrestricted), 0);
    }

    function test_SafesWithCodeVerifyWhenRequired() public {
        Plan memory p = _plan();
        p.requireRecipientCode = true;
        _giveCode(p);
        h.validate(p);
        h.verify(p, h.deploy(p));
    }

    function test_LoadParsesPlannerOutput() public view {
        Plan memory p = h.load(_json("", "", ""));
        assertEq(p.chainId, 31337);
        assertEq(p.allocations.publicLaunch, ARLAllocation.PUBLIC_LAUNCH);
        assertEq(p.allocations.investors, ARLAllocation.INVESTORS);
        assertEq(p.allocations.grantsBugBounty, ARLAllocation.GRANTS_BUG_BOUNTY);
        assertEq(p.allocations.founder, ARLAllocation.FOUNDER);
        assertEq(p.founderTranches.unrestricted, ARLAllocation.FOUNDER_UNRESTRICTED);
        assertEq(p.founderTranches.reserved, ARLAllocation.FOUNDER_RESERVED);
        assertEq(p.recipients.founderUnrestricted, 0xF600D8BD9AFeCE824Dd0Fb55E995B1728f651068);
        assertEq(p.recipients.founderReserved, 0x48310346982561f9c00359Cb1851594eE8C58FF8);
        assertEq(p.investors.cliffEnd, CLIFF_END);
        assertEq(p.strategicPartnerships.vestingEnd, VESTING_END);
        assertEq(p.minDelay, 48 hours);
        assertEq(p.treasuryGuardian, 0x0c0bA8A2630B2108D5aF98B64fA89eF1BDb7C9d4);
        assertEq(p.recipients.earlyUsers, 0x259238550bE2D033DdCBD0dDA00c427738C27991);
        h.validate(p);
    }

    // ------------------------------------------------------------------ loading (fail closed)

    /// @dev An `arl-deploy-plan/2` plan (with its founder vesting wallet) is rejected, never
    /// reinterpreted.
    function test_RevertWhen_PlanHasOldSchema() public {
        string memory json =
            vm.replace(_json("", "", ""), '"arl-deploy-plan/3"', '"arl-deploy-plan/2"');
        vm.expectRevert(
            abi.encodeWithSelector(ARLDeployPlan.PlanSchemaMismatch.selector, "arl-deploy-plan/2")
        );
        h.load(json);
    }

    function test_RevertWhen_PlanHasFounderVesting() public {
        string memory json = vm.replace(
            _json("", "", ""),
            '"vesting":{',
            string.concat(
                '"vesting":{"founder":{"beneficiary":"0x1F67caa874DDec60E290e27cce758f01Bd53c380",',
                '"cliffStart":1798761600,"cliffEnd":1830297600,"vestingEnd":1893456000},'
            )
        );
        vm.expectRevert(ARLDeployPlan.PlanFounderVestingNotAllowed.selector);
        h.load(json);
    }

    function test_RevertWhen_PlanMissesFounderTranches() public {
        string memory json = vm.replace(
            _json("", "", ""),
            '"founderTranches":{"unrestricted":"2000000000000000000000000","reserved":"100000000000000000000000"},',
            ""
        );
        vm.expectRevert();
        h.load(json);
    }

    function test_RevertWhen_PlanFieldMissing() public {
        vm.expectRevert();
        h.load('{"chainId":31337}');
    }

    function test_RevertWhen_PlanHasLegacyEcosystemReserve() public {
        vm.expectRevert(
            abi.encodeWithSelector(ARLDeployPlan.PlanLegacyAllocation.selector, "ecosystemReserve")
        );
        h.load(
            _json(
                "",
                "",
                '"ecosystemReserve":{"beneficiary":"0x61042dF2f9DfD50AFC0734F5CB4da6E55bE6d09d","start":1798761600},'
            )
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanLegacyAllocation.selector, "allocations.ecosystemReserve"
            )
        );
        h.load(_json('"ecosystemReserve":"7000000000000000000000000",', "", ""));
    }

    function test_RevertWhen_PlanHasExtraAllocation() public {
        vm.expectRevert(
            abi.encodeWithSelector(ARLDeployPlan.PlanUnexpectedKeys.selector, "allocations", 12, 11)
        );
        h.load(_json('"bonus":"1",', "", ""));
    }

    function test_RevertWhen_PlanMissesAnAllocation() public {
        string memory json = _json("", "", "");
        // Drop the investors entry.
        json = vm.replace(json, '"investors":"1500000000000000000000000",', "");
        vm.expectRevert(
            abi.encodeWithSelector(ARLDeployPlan.PlanUnexpectedKeys.selector, "allocations", 10, 11)
        );
        h.load(json);
    }

    function test_RevertWhen_PlanHasExtraRecipient() public {
        vm.expectRevert(
            abi.encodeWithSelector(ARLDeployPlan.PlanUnexpectedKeys.selector, "recipients", 10, 9)
        );
        h.load(_json("", '"earlyUserRewards":"0x480F68E166456e8a00584F003575d6975a8f2aFB",', ""));
    }

    // ------------------------------------------------------------------ constant guards

    function test_DelayFloorMatchesTimelock() public {
        address[] memory safe = new address[](1);
        safe[0] = makeAddr("safe");
        ARLTimelock tl = new ARLTimelock(48 hours, safe, safe, makeAddr("guardian"));
        assertEq(ARLDeployPlan.TIMELOCK_DELAY_FLOOR, tl.MIN_DELAY_FLOOR());
    }

    /// @dev Flipping this requires the approved investor and strategic partnership schedules to
    /// be implemented.
    function test_VestingSchedulesAreNotApprovedYet() public pure {
        assertFalse(ARLDeployPlan.VESTING_SCHEDULES_APPROVED);
    }

    /// @dev Flipping this requires an approved custody decision for the Founder Reserved
    /// tranche.
    function test_FounderReserveCustodyIsNotApprovedYet() public pure {
        assertFalse(ARLDeployPlan.FOUNDER_RESERVE_CUSTODY_APPROVED);
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

    function test_RevertWhen_VestingSchedulesNotApprovedOffLocal() public {
        vm.chainId(11155111);
        Plan memory p = _plan();
        p.requireRecipientCode = true;
        _giveCode(p);
        vm.expectRevert(
            abi.encodeWithSelector(ARLDeployPlan.PlanVestingScheduleNotApproved.selector, 11155111)
        );
        h.validate(p);
    }

    /// @dev Even with every vesting schedule approved, a non-local plan fails closed while the
    /// Founder Reserved custody is not approved.
    function test_RevertWhen_FounderReserveCustodyNotApprovedOffLocal() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanFounderReserveCustodyNotApproved.selector, 11155111
            )
        );
        h.approvalGate(11155111, true, false);

        vm.expectRevert(
            abi.encodeWithSelector(ARLDeployPlan.PlanVestingScheduleNotApproved.selector, 1)
        );
        h.approvalGate(1, false, true);

        // Only when both decisions are approved does the gate open off local Anvil.
        h.approvalGate(11155111, true, true);
    }

    /// @dev Local Anvil may rehearse with the Founder Reserved custody still TBD.
    function test_LocalRehearsalAllowedWhileReserveCustodyTbd() public {
        h.approvalGate(31337, false, false);
        Plan memory p = _plan();
        assertEq(p.chainId, 31337);
        h.validate(p);
    }

    function test_RevertWhen_RecipientHasNoCode() public {
        Plan memory p = _plan();
        p.requireRecipientCode = true;
        _giveCode(p);
        vm.etch(p.recipients.ecosystemGrowth, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanRecipientHasNoCode.selector,
                "recipients.ecosystemGrowth",
                p.recipients.ecosystemGrowth
            )
        );
        h.validate(p);
    }

    /// @dev Off local Anvil the Founder Unrestricted holder must be a contract (a Safe), not a
    /// single-key account whose loss would strand 2,000,000 ARL (M-3).
    function test_RevertWhen_FounderUnrestrictedHasNoCodeWhenRequired() public {
        Plan memory p = _plan();
        p.requireRecipientCode = true;
        _giveCode(p);
        vm.etch(p.recipients.founderUnrestricted, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanRecipientHasNoCode.selector,
                "recipients.founderUnrestricted",
                p.recipients.founderUnrestricted
            )
        );
        h.validate(p);
    }

    /// @dev The Founder Reserved custody is TBD, so the plan does not presume a Safe for it; the
    /// approval gate is what blocks non-local deployment.
    function test_FounderReservedCustodyIsNotPresumed() public {
        Plan memory p = _plan();
        p.requireRecipientCode = true;
        _giveCode(p);
        assertEq(p.recipients.founderReserved.code.length, 0);
        h.validate(p);
    }

    function test_BeneficiariesWithoutCodeAllowedLocally() public {
        Plan memory p = _plan();
        assertFalse(p.requireRecipientCode);
        assertEq(p.recipients.founderUnrestricted.code.length, 0);
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
        p.investors.beneficiary = address(0);
        _expectZero("vesting.investors.beneficiary");
        h.validate(p);

        p = _plan();
        p.recipients.grantsBugBounty = address(0);
        _expectZero("recipients.grantsBugBounty");
        h.validate(p);

        p = _plan();
        p.recipients.founderUnrestricted = address(0);
        _expectZero("recipients.founderUnrestricted");
        h.validate(p);

        p = _plan();
        p.recipients.founderReserved = address(0);
        _expectZero("recipients.founderReserved");
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

    /// @dev Every allocation has its own dedicated holder; reusing one is a duplicate allocation.
    function test_RevertWhen_AddressReused() public {
        Plan memory p = _plan();
        p.recipients.liquidity = p.recipients.communityStaking;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanAddressReused.selector,
                "recipients.liquidity",
                "recipients.communityStaking"
            )
        );
        h.validate(p);

        p = _plan();
        p.recipients.team = p.recipients.founderUnrestricted;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanAddressReused.selector,
                "recipients.team",
                "recipients.founderUnrestricted"
            )
        );
        h.validate(p);
    }

    /// @dev The reserved tranche must never share an address with the unrestricted tranche or
    /// any other holder, so it cannot silently become unrestricted or join another allocation.
    function test_RevertWhen_FounderReservedAddressReused() public {
        Plan memory p = _plan();
        p.recipients.founderReserved = p.recipients.founderUnrestricted;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanAddressReused.selector,
                "recipients.founderReserved",
                "recipients.founderUnrestricted"
            )
        );
        h.validate(p);

        p = _plan();
        p.recipients.founderReserved = p.treasurySafe;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanAddressReused.selector,
                "recipients.founderReserved",
                "treasury.safe"
            )
        );
        h.validate(p);

        p = _plan();
        p.recipients.founderReserved = p.investors.beneficiary;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanAddressReused.selector,
                "recipients.founderReserved",
                "vesting.investors.beneficiary"
            )
        );
        h.validate(p);
    }

    function test_RevertWhen_FounderTrancheMismatch() public {
        Plan memory p = _plan();
        p.founderTranches.unrestricted += 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanAllocationMismatch.selector,
                "founderTranches.unrestricted",
                ARLAllocation.FOUNDER_UNRESTRICTED + 1,
                ARLAllocation.FOUNDER_UNRESTRICTED
            )
        );
        h.validate(p);

        // Swapping the tranches keeps the Founder total but is still rejected.
        p = _plan();
        (p.founderTranches.unrestricted, p.founderTranches.reserved) =
        (p.founderTranches.reserved, p.founderTranches.unrestricted);
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanAllocationMismatch.selector,
                "founderTranches.unrestricted",
                ARLAllocation.FOUNDER_RESERVED,
                ARLAllocation.FOUNDER_UNRESTRICTED
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

    /// @dev Amounts are keyed by allocation, so swapping two amounts is caught even though the
    /// total is unchanged.
    function test_RevertWhen_AllocationsSwapped() public {
        Plan memory p = _plan();
        (p.allocations.founder, p.allocations.investors) =
        (p.allocations.investors, p.allocations.founder);
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanAllocationMismatch.selector,
                "founder",
                ARLAllocation.INVESTORS,
                ARLAllocation.FOUNDER
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
        p.investors.cliffStart = 0;
        _expectSchedule("investors start is zero");
        h.validate(p);

        p = _plan();
        p.investors.cliffEnd = p.investors.cliffStart - 1;
        _expectSchedule("investors cliff end is before its start");
        h.validate(p);

        p = _plan();
        p.strategicPartnerships.vestingEnd = p.strategicPartnerships.cliffEnd;
        _expectSchedule("strategicPartnerships vesting end is not after cliff end");
        h.validate(p);
    }

    function testFuzz_DelayMustBeAtLeast48Hours(uint256 delay) public {
        delay = bound(delay, 0, 30 days);
        Plan memory p = _plan();
        p.minDelay = delay;
        if (delay < 48 hours) vm.expectRevert();
        h.validate(p);
    }

    function testFuzz_ScheduleOrdering(uint64 cliffStart, uint64 cliffEnd, uint64 vestingEnd)
        public
    {
        Plan memory p = _plan();
        p.investors = VestingPlan(p.investors.beneficiary, cliffStart, cliffEnd, vestingEnd);
        bool valid = cliffStart != 0 && cliffEnd >= cliffStart && vestingEnd > cliffEnd;
        if (!valid) vm.expectRevert();
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
        p.investors.vestingEnd += 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLVerify.VerifyUintMismatch.selector,
                "investors vesting end",
                uint256(VESTING_END) + 1,
                uint256(VESTING_END)
            )
        );
        h.verify(p, d);
    }

    function test_RevertWhen_VerifyWrongBeneficiary() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        address planned = p.investors.beneficiary;
        p.investors.beneficiary = makeAddr("other");
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLVerify.VerifyAddressMismatch.selector,
                "investors beneficiary",
                p.investors.beneficiary,
                planned
            )
        );
        h.verify(p, d);
    }

    function test_RevertWhen_VerifyWrongAmount() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        p.allocations.earlyUsers -= 1;
        p.allocations.grantsBugBounty += 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLVerify.VerifyUintMismatch.selector,
                "allocation balance",
                ARLAllocation.EARLY_USERS - 1,
                ARLAllocation.EARLY_USERS
            )
        );
        h.verify(p, d);
    }

    function test_RevertWhen_VerifyFounderReservedAtWrongAddress() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        p.recipients.founderReserved = makeAddr("elsewhere");
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLVerify.VerifyUintMismatch.selector,
                "allocation balance",
                ARLAllocation.FOUNDER_RESERVED,
                0
            )
        );
        h.verify(p, d);
    }

    function test_RevertWhen_VerifyFounderTranchesDoNotReconcile() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        p.founderTranches.reserved += 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLVerify.VerifyUintMismatch.selector,
                "founder tranches",
                ARLAllocation.FOUNDER,
                ARLAllocation.FOUNDER + 1
            )
        );
        h.verify(p, d);
    }

    /// @dev The token itself accepts a shared holder; the verifier refuses it.
    function test_RevertWhen_VerifySharedHolder() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        p.recipients.liquidity = p.recipients.communityStaking;
        d.token = new ARLToken(
            ARLToken.Recipients({
                publicLaunch: p.recipients.publicLaunch,
                communityStaking: p.recipients.communityStaking,
                ecosystemGrowth: p.recipients.ecosystemGrowth,
                strategicPartnerships: address(d.partnershipsVesting),
                liquidity: p.recipients.liquidity,
                founderUnrestricted: p.recipients.founderUnrestricted,
                founderReserved: p.recipients.founderReserved,
                investors: address(d.investorsVesting),
                treasury: address(d.timelock),
                team: p.recipients.team,
                earlyUsers: p.recipients.earlyUsers,
                grantsBugBounty: p.recipients.grantsBugBounty
            })
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLVerify.VerifyFailed.selector, "allocation holders are distinct"
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

    function test_RevertWhen_VerifyFounderUnrestrictedHasNoCode() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        p.requireRecipientCode = true;
        _giveCode(p);
        vm.etch(p.recipients.founderUnrestricted, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLVerify.VerifyAddressMismatch.selector,
                "recipients.founderUnrestricted",
                p.recipients.founderUnrestricted,
                address(0)
            )
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
        (, address[12] memory account) = ARLDeployPlan.safeRoles(p);
        for (uint256 i = 0; i < account.length; i++) {
            vm.etch(account[i], hex"00");
        }
    }

    function _expectZero(string memory field) internal {
        vm.expectRevert(abi.encodeWithSelector(ARLDeployPlan.PlanZeroAddress.selector, field));
    }

    function _expectSchedule(string memory reason) internal {
        vm.expectRevert(abi.encodeWithSelector(ARLDeployPlan.PlanInvalidSchedule.selector, reason));
    }

    /// @dev The shape and values `packages/deploy` produces for `local.json` (the `source`
    /// section is omitted). Extra entries are inserted at the start of each section.
    function _json(
        string memory extraAllocation,
        string memory extraRecipient,
        string memory extraTop
    ) internal pure returns (string memory) {
        string memory allocations = string.concat(
            '"allocations":{',
            extraAllocation,
            '"publicLaunch":"5000000000000000000000000","communityStaking":"3000000000000000000000000",',
            '"ecosystemGrowth":"2000000000000000000000000","strategicPartnerships":"2000000000000000000000000",',
            '"liquidity":"2000000000000000000000000","founder":"2100000000000000000000000",',
            '"investors":"1500000000000000000000000","treasury":"1000000000000000000000000",',
            '"team":"900000000000000000000000","earlyUsers":"1100000000000000000000000",',
            '"grantsBugBounty":"400000000000000000000000"},',
            '"founderTranches":{"unrestricted":"2000000000000000000000000","reserved":"100000000000000000000000"},'
        );
        string memory vesting = string.concat(
            '"vesting":{"investors":{"beneficiary":"0x4bCb1679EEfBA34C88F55c0D07efe4EA9bfF4721",',
            '"cliffStart":1798761600,"cliffEnd":1830297600,"vestingEnd":1893456000},',
            '"strategicPartnerships":{"beneficiary":"0x5F611FC6df7B0e0326A6B10b135A15DdF8667c2a",',
            '"cliffStart":1798761600,"cliffEnd":1830297600,"vestingEnd":1893456000}},'
        );
        string memory treasury = string.concat(
            '"treasury":{"safe":"0xCbA140fcD82caf116be04c2a478A0e10b55202F9",',
            '"guardian":"0x0c0bA8A2630B2108D5aF98B64fA89eF1BDb7C9d4","minDelay":172800},'
        );
        string memory recipients = string.concat(
            '"recipients":{',
            extraRecipient,
            '"publicLaunch":"0x1E0C4aef807F25F0F79146f3A9646e75954E0E0d",',
            '"communityStaking":"0x86d861EBe84C3F6D4F374c9640c5b89549C724A8",',
            '"ecosystemGrowth":"0x8F188E2C17b8CC001AeBA6e4A46D916f0A260Be3",',
            '"liquidity":"0x179DaF8783071e3868Fb00208B3529F48E544AF8",',
            '"founderUnrestricted":"0xF600D8BD9AFeCE824Dd0Fb55E995B1728f651068",',
            '"founderReserved":"0x48310346982561f9c00359Cb1851594eE8C58FF8",',
            '"team":"0xB5C15dcF9624e2137D772f72fCB1020B6Cba1455",',
            '"earlyUsers":"0x259238550bE2D033DdCBD0dDA00c427738C27991",',
            '"grantsBugBounty":"0x2F050E3aAFBFb59BD438F97c4D280D0d38F411c4"}'
        );
        return string.concat(
            '{"schema":"arl-deploy-plan/3","network":"local","chainId":31337,',
            extraTop,
            '"requireRecipientCode":false,"maxSupply":"21000000000000000000000000",',
            allocations,
            vesting,
            treasury,
            recipients,
            "}"
        );
    }
}
