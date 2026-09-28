// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {DateTime} from "solidity-datetime/DateTime.sol";

import {ARLAllocation} from "../../src/ARLAllocation.sol";
import {ARLTimelock} from "../../src/ARLTimelock.sol";
import {ARLToken} from "../../src/ARLToken.sol";
import {
    ARLDeployPlan,
    Allocations,
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

    function singletonAllowed(uint256 chainId, address singleton, bytes32 safeHash, bytes32 l2Hash)
        external
        view
        returns (bool)
    {
        return ARLDeployPlan.singletonAllowed(chainId, singleton, safeHash, l2Hash);
    }

    function isSafeProxy(address account, address[] memory singletons)
        external
        view
        returns (bool)
    {
        return ARLDeployPlan.isSafeProxy(
            account, singletons, ARLDeployPlan.SAFE_PROXY_V150_CODEHASH
        );
    }

    function validateSchedule(string memory name, VestingPlan memory v) external pure {
        ARLDeployPlan.validateSchedule(name, v);
    }

    function approvalGate(uint256 chainId, bool vestingApproved) external pure {
        ARLDeployPlan.approvalGate(chainId, vestingApproved);
    }

    function deploy(Plan memory p) external returns (Deployment memory) {
        return ARLDeployer.deploy(p, address(this));
    }

    function verify(Plan memory p, Deployment memory d) external view {
        ARLVerify.verify(p, d);
    }
}

/// @dev Vesting schedules use the approved durations (12-month cliff, 36 months linear); the
/// start date is a fixture, since the vesting start is not confirmed.
contract ARLDeployTest is Test {
    uint64 internal constant START = 1_798_761_600; // 2027-01-01T00:00:00Z
    uint64 internal constant CLIFF_END = 1_830_297_600; // 2028-01-01T00:00:00Z
    uint64 internal constant VESTING_END = 1_924_992_000; // 2031-01-01T00:00:00Z

    /// @dev Runtime code of `SafeProxy` v1.5.0, copied from the official build
    /// (safe-smart-account 1.5.0, `deployedBytecode`). A test in `packages/deploy` fails if it
    /// differs from that build. Its singleton is read from storage slot 0.
    bytes internal constant SAFE_PROXY_RUNTIME =
        hex"608060405260005463a619486e60003560e01c14156024578060601b606c5260206060f35b3660008037600080366000845af43d6000803e806040573d6000fd5b3d6000f3fea2646970667358221220e61834ebd2d8cd909d362bf67c47ef58fd665df38e6dd036ce65611101d072e964736f6c63430007060033";

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
        p.investors = VestingPlan(makeAddr("investorsSafe"), START, CLIFF_END, VESTING_END);
        p.strategicPartnerships =
            VestingPlan(makeAddr("partnershipsSafe"), START, CLIFF_END, VESTING_END);
        p.treasurySafe = makeAddr("treasurySafe");
        p.treasuryGuardian = makeAddr("guardianSafe");
        p.minDelay = 48 hours;
        p.recipients = Recipients({
            publicLaunch: makeAddr("launchSafe"),
            communityStaking: makeAddr("communitySafe"),
            ecosystemGrowth: makeAddr("growthSafe"),
            liquidity: makeAddr("liquiditySafe"),
            founder: makeAddr("founderSafe"),
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
        assertEq(d.token.balanceOf(p.recipients.founder), 2_100_000e18);
        assertEq(d.token.balanceOf(address(d.investorsVesting)), 1_500_000e18);
        assertEq(d.token.balanceOf(address(d.partnershipsVesting)), 2_000_000e18);
        assertEq(d.token.balanceOf(p.recipients.publicLaunch), 5_000_000e18);
        assertEq(d.investorsVesting.cliffEnd(), CLIFF_END);
        assertEq(d.partnershipsVesting.owner(), p.strategicPartnerships.beneficiary);
    }

    /// @dev The Founder allocation is minted straight to the planned Founder Safe. It is not a
    /// contract the deployer created, so it cannot be a vesting wallet, and the Founder can move
    /// the whole allocation immediately.
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
            assertTrue(deployed[i] != p.recipients.founder);
        }
        assertEq(p.recipients.founder.code.length, 0);

        vm.prank(p.recipients.founder);
        assertTrue(d.token.transfer(makeAddr("buyer"), ARLAllocation.FOUNDER));
        assertEq(d.token.balanceOf(p.recipients.founder), 0);
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
        assertEq(p.recipients.founder, 0x1F67caa874DDec60E290e27cce758f01Bd53c380);
        assertEq(p.investors.cliffEnd, CLIFF_END);
        assertEq(p.strategicPartnerships.vestingEnd, VESTING_END);
        assertEq(p.minDelay, 48 hours);
        assertEq(p.treasuryGuardian, 0x0c0bA8A2630B2108D5aF98B64fA89eF1BDb7C9d4);
        assertEq(p.recipients.earlyUsers, 0x259238550bE2D033DdCBD0dDA00c427738C27991);
        assertEq(p.safeSingletons.length, 0);
        h.validate(p);
    }

    // ------------------------------------------------------------------ loading (fail closed)

    /// @dev An `arl-deploy-plan/2` plan (with its founder vesting wallet) is rejected, never
    /// reinterpreted.
    function test_RevertWhen_PlanHasOldSchema() public {
        string memory json =
            vm.replace(_json("", "", ""), '"arl-deploy-plan/5"', '"arl-deploy-plan/2"');
        vm.expectRevert(
            abi.encodeWithSelector(ARLDeployPlan.PlanSchemaMismatch.selector, "arl-deploy-plan/2")
        );
        h.load(json);

        // Schema 3 has no Safe singletons.
        json = vm.replace(_json("", "", ""), '"arl-deploy-plan/5"', '"arl-deploy-plan/3"');
        vm.expectRevert(
            abi.encodeWithSelector(ARLDeployPlan.PlanSchemaMismatch.selector, "arl-deploy-plan/3")
        );
        h.load(json);

        // Schema 4 split the Founder allocation into two tranches.
        json = vm.replace(_json("", "", ""), '"arl-deploy-plan/5"', '"arl-deploy-plan/4"');
        vm.expectRevert(
            abi.encodeWithSelector(ARLDeployPlan.PlanSchemaMismatch.selector, "arl-deploy-plan/4")
        );
        h.load(json);
    }

    function test_RevertWhen_PlanMissesSafeSection() public {
        string memory json = vm.replace(_json("", "", ""), ',"safe":{"singletons":[]}', "");
        vm.expectRevert();
        h.load(json);
    }

    // ------------------------------------------------------------------ genuine Safes

    function test_SafeProxyRuntimeMatchesConstant() public pure {
        assertEq(keccak256(SAFE_PROXY_RUNTIME), ARLDeployPlan.SAFE_PROXY_V150_CODEHASH);
    }

    function test_RevertWhen_SafeRoleIsNotASafeProxy() public {
        Plan memory p = _plan();
        p.requireRecipientCode = true;
        _giveCode(p);
        // Code is present, but it is not the Safe proxy.
        vm.etch(p.recipients.liquidity, hex"00");
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanNotASafe.selector, "recipients.liquidity", p.recipients.liquidity
            )
        );
        h.validate(p);
    }

    function test_RevertWhen_SafePointsToUnlistedSingleton() public {
        Plan memory p = _plan();
        p.requireRecipientCode = true;
        _giveCode(p);
        vm.store(p.treasurySafe, bytes32(0), bytes32(uint256(uint160(makeAddr("fakeSingleton")))));
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanNotASafe.selector, "treasury.safe", p.treasurySafe
            )
        );
        h.validate(p);
    }

    function test_RevertWhen_FounderIsNotASafe() public {
        Plan memory p = _plan();
        p.requireRecipientCode = true;
        _giveCode(p);
        vm.etch(p.recipients.founder, hex"6000");
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanNotASafe.selector, "recipients.founder", p.recipients.founder
            )
        );
        h.validate(p);
    }

    function test_RevertWhen_SafeSingletonsMissing() public {
        Plan memory p = _plan();
        p.requireRecipientCode = true;
        _giveCode(p);
        p.safeSingletons = new address[](0);
        vm.expectRevert(ARLDeployPlan.PlanSafeSingletonsMissing.selector);
        h.validate(p);
    }

    /// @dev Off local Anvil only the canonical singletons with the canonical code are allowed.
    function test_SingletonAllowedOnlyIfCanonicalOffLocal() public {
        address safe = ARLDeployPlan.SAFE_SINGLETON_V150;
        address safeL2 = ARLDeployPlan.SAFE_L2_SINGLETON_V150;
        vm.etch(safe, hex"01");
        vm.etch(safeL2, hex"02");
        bytes32 safeHash = safe.codehash;
        bytes32 l2Hash = safeL2.codehash;

        assertTrue(h.singletonAllowed(1, safe, safeHash, l2Hash));
        assertTrue(h.singletonAllowed(1, safeL2, safeHash, l2Hash));
        // Right address, wrong code.
        assertFalse(h.singletonAllowed(1, safe, l2Hash, l2Hash));
        assertFalse(h.singletonAllowed(1, safeL2, safeHash, safeHash));
        // Not a canonical address.
        address other = makeAddr("otherSingleton");
        vm.etch(other, hex"01");
        assertFalse(h.singletonAllowed(1, other, safeHash, l2Hash));
        // With the real constants, the etched stand-ins are rejected.
        assertFalse(
            h.singletonAllowed(
                1,
                safe,
                ARLDeployPlan.SAFE_SINGLETON_V150_CODEHASH,
                ARLDeployPlan.SAFE_L2_SINGLETON_V150_CODEHASH
            )
        );
        // Local Anvil rehearses with its own singleton.
        assertTrue(h.singletonAllowed(31337, other, bytes32(0), bytes32(0)));
    }

    function test_IsSafeProxyRequiresProxyCodeAndListedSingleton() public {
        address account = makeAddr("safe");
        address singleton = makeAddr("singleton");
        address[] memory singletons = new address[](1);
        singletons[0] = singleton;

        assertFalse(h.isSafeProxy(account, singletons)); // no code
        vm.etch(account, SAFE_PROXY_RUNTIME);
        assertFalse(h.isSafeProxy(account, singletons)); // slot 0 empty
        vm.store(account, bytes32(0), bytes32(uint256(uint160(singleton))));
        assertTrue(h.isSafeProxy(account, singletons));
        assertFalse(h.isSafeProxy(account, new address[](0)));
    }

    function test_RevertWhen_VerifySafeRoleIsNotASafeProxy() public {
        Plan memory p = _plan();
        p.requireRecipientCode = true;
        _giveCode(p);
        Deployment memory d = h.deploy(p);
        h.verify(p, d);
        vm.etch(p.treasuryGuardian, hex"00");
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLVerify.VerifyFailed.selector, "treasury.guardian is a Safe v1.5.0 proxy"
            )
        );
        h.verify(p, d);
    }

    function test_RevertWhen_PlanHasFounderVesting() public {
        string memory json = vm.replace(
            _json("", "", ""),
            '"vesting":{',
            string.concat(
                '"vesting":{"founder":{"beneficiary":"0x1F67caa874DDec60E290e27cce758f01Bd53c380",',
                '"cliffStart":1798761600,"cliffEnd":1830297600,"vestingEnd":1924992000},'
            )
        );
        vm.expectRevert(ARLDeployPlan.PlanFounderVestingNotAllowed.selector);
        h.load(json);
    }

    /// @dev The Founder allocation is no longer split: a tranche section is rejected, never
    /// reinterpreted.
    function test_RevertWhen_PlanHasFounderTranches() public {
        vm.expectRevert(
            abi.encodeWithSelector(ARLDeployPlan.PlanLegacyAllocation.selector, "founderTranches")
        );
        h.load(
            _json(
                "",
                "",
                '"founderTranches":{"unrestricted":"2000000000000000000000000","reserved":"100000000000000000000000"},'
            )
        );
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
            abi.encodeWithSelector(ARLDeployPlan.PlanUnexpectedKeys.selector, "recipients", 9, 8)
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

    /// @dev Off local Anvil the gate opens only once the vesting schedules are approved.
    function test_ApprovalGateOffLocal() public {
        vm.expectRevert(
            abi.encodeWithSelector(ARLDeployPlan.PlanVestingScheduleNotApproved.selector, 1)
        );
        h.approvalGate(1, false);

        h.approvalGate(11155111, true);
    }

    /// @dev Local Anvil may rehearse while the vesting start is still TBD.
    function test_LocalRehearsalAllowedWhileVestingStartTbd() public {
        h.approvalGate(31337, false);
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

    /// @dev Off local Anvil the Founder holder must be a contract (a Safe), not a single-key
    /// account whose loss would strand 2,100,000 ARL (M-3).
    function test_RevertWhen_FounderHasNoCodeWhenRequired() public {
        Plan memory p = _plan();
        p.requireRecipientCode = true;
        _giveCode(p);
        vm.etch(p.recipients.founder, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanRecipientHasNoCode.selector,
                "recipients.founder",
                p.recipients.founder
            )
        );
        h.validate(p);
    }

    function test_BeneficiariesWithoutCodeAllowedLocally() public {
        Plan memory p = _plan();
        assertFalse(p.requireRecipientCode);
        assertEq(p.recipients.founder.code.length, 0);
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
        p.recipients.founder = address(0);
        _expectZero("recipients.founder");
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
        p.recipients.team = p.recipients.founder;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanAddressReused.selector, "recipients.team", "recipients.founder"
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
        // Keep timestamps within the calendar range the date library handles (years <= 9999).
        cliffStart = uint64(bound(cliffStart, 0, 200_000_000_000));
        Plan memory p = _plan();
        p.investors = VestingPlan(p.investors.beneficiary, cliffStart, cliffEnd, vestingEnd);
        bool valid = cliffStart != 0 && cliffEnd >= cliffStart && vestingEnd > cliffEnd
            && cliffEnd == DateTime.addMonths(cliffStart, 12)
            && vestingEnd == DateTime.addMonths(cliffEnd, 36);
        if (!valid) vm.expectRevert();
        h.validate(p);
    }

    /// @dev Any start date with the approved durations is accepted (the start itself is TBD).
    function testFuzz_ApprovedDurationsAcceptedForAnyStart(uint64 start) public {
        start = uint64(bound(start, 1, 4_102_444_800)); // up to 2100-01-01
        Plan memory p = _plan();
        uint64 cliffEnd = uint64(DateTime.addMonths(start, 12));
        uint64 vestingEnd = uint64(DateTime.addMonths(cliffEnd, 36));
        p.investors = VestingPlan(p.investors.beneficiary, start, cliffEnd, vestingEnd);
        h.validate(p);
    }

    /// @dev The approved schedule is a 12-month cliff and 36 months of linear vesting, in
    /// calendar months. A schedule that is ordered but has other durations is rejected.
    function test_RevertWhen_ScheduleDurationsNotApproved() public {
        Plan memory p = _plan();
        p.investors.cliffEnd = 1_814_400_000; // 2027-07-01: a 6-month cliff
        p.investors.vestingEnd = uint64(DateTime.addMonths(p.investors.cliffEnd, 36));
        _expectSchedule("investors cliff is not 12 calendar months");
        h.validate(p);

        p = _plan();
        p.strategicPartnerships.vestingEnd = 1_893_456_000; // 2030-01-01: 24 months linear
        _expectSchedule("strategicPartnerships linear vesting is not 36 calendar months");
        h.validate(p);

        // One second off is not a calendar-month schedule either.
        p = _plan();
        p.investors.vestingEnd += 1;
        _expectSchedule("investors linear vesting is not 36 calendar months");
        h.validate(p);
    }

    function test_ApprovedDurationConstants() public pure {
        assertEq(ARLDeployPlan.VESTING_CLIFF_MONTHS, 12);
        assertEq(ARLDeployPlan.VESTING_LINEAR_MONTHS, 36);
        // 2027-01-01 + 12 months = 2028-01-01; + 36 months = 2031-01-01.
        assertEq(DateTime.addMonths(START, 12), CLIFF_END);
        assertEq(DateTime.addMonths(CLIFF_END, 36), VESTING_END);
    }

    /// @dev The deployer does not validate; the verifier must still reject a deployment whose
    /// planned schedule does not have the approved durations, even though chain and plan agree.
    function test_RevertWhen_VerifyPlanScheduleNotApproved() public {
        Plan memory p = _plan();
        p.investors.vestingEnd = uint64(DateTime.addMonths(p.investors.cliffEnd, 24));
        Deployment memory d = h.deploy(p);
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLDeployPlan.PlanInvalidSchedule.selector,
                "investors linear vesting is not 36 calendar months"
            )
        );
        h.verify(p, d);
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
                founder: p.recipients.founder,
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

    function test_RevertWhen_VerifyFounderHasNoCode() public {
        Plan memory p = _plan();
        Deployment memory d = h.deploy(p);
        p.requireRecipientCode = true;
        _giveCode(p);
        vm.etch(p.recipients.founder, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLVerify.VerifyAddressMismatch.selector,
                "recipients.founder",
                p.recipients.founder,
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

    /// @dev Turns every Safe role into a Safe v1.5.0 proxy of a test singleton (local chain).
    function _giveCode(Plan memory p) internal {
        address singleton = makeAddr("safeSingleton");
        p.safeSingletons = new address[](1);
        p.safeSingletons[0] = singleton;
        (, address[12] memory account) = ARLDeployPlan.safeRoles(p);
        for (uint256 i = 0; i < account.length; i++) {
            vm.etch(account[i], SAFE_PROXY_RUNTIME);
            vm.store(account[i], bytes32(0), bytes32(uint256(uint160(singleton))));
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
            '"grantsBugBounty":"400000000000000000000000"},'
        );
        string memory vesting = string.concat(
            '"vesting":{"investors":{"beneficiary":"0x4bCb1679EEfBA34C88F55c0D07efe4EA9bfF4721",',
            '"cliffStart":1798761600,"cliffEnd":1830297600,"vestingEnd":1924992000},',
            '"strategicPartnerships":{"beneficiary":"0x5F611FC6df7B0e0326A6B10b135A15DdF8667c2a",',
            '"cliffStart":1798761600,"cliffEnd":1830297600,"vestingEnd":1924992000}},'
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
            '"founder":"0x1F67caa874DDec60E290e27cce758f01Bd53c380",',
            '"team":"0xB5C15dcF9624e2137D772f72fCB1020B6Cba1455",',
            '"earlyUsers":"0x259238550bE2D033DdCBD0dDA00c427738C27991",',
            '"grantsBugBounty":"0x2F050E3aAFBFb59BD438F97c4D280D0d38F411c4"}'
        );
        return string.concat(
            '{"schema":"arl-deploy-plan/5","network":"local","chainId":31337,',
            extraTop,
            '"requireRecipientCode":false,"maxSupply":"21000000000000000000000000",',
            allocations,
            vesting,
            treasury,
            recipients,
            ',"safe":{"singletons":[]}',
            "}"
        );
    }
}
