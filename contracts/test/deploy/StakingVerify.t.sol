// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLAllocation} from "../../src/ARLAllocation.sol";
import {ARLStakingRewards} from "../../src/ARLStakingRewards.sol";
import {Allocations, Plan, Recipients, VestingPlan} from "../../script/ARLDeployPlan.sol";
import {ARLDeployer, Deployment} from "../../script/ARLDeployer.sol";
import {ARLStakingVerify} from "../../script/ARLStakingVerify.sol";

contract OtherToken is ERC20 {
    constructor() ERC20("Other", "OTH") {}
}

/// @dev External wrapper so `vm.expectRevert` can observe reverts from the library.
contract StakingVerifyHarness {
    function deploy(Plan memory p) external returns (Deployment memory) {
        return ARLDeployer.deploy(p, address(this));
    }

    function verify(Plan memory p, address token, ARLStakingRewards s, bool fresh) external view {
        ARLStakingVerify.verify(p, token, s, fresh);
    }
}

/// @dev The staking distributor must be the plan's Community & Staking holder. Addresses and
/// the reward duration are test values only.
contract StakingVerifyTest is Test {
    uint64 internal constant START = 1_798_761_600; // 2027-01-01T00:00:00Z
    uint64 internal constant CLIFF_END = 1_830_297_600; // 2028-01-01T00:00:00Z
    uint64 internal constant VESTING_END = 1_924_992_000; // 2031-01-01T00:00:00Z
    uint256 internal constant DURATION = 30 days;

    StakingVerifyHarness internal h;
    Plan internal plan;
    Deployment internal d;

    function setUp() public {
        h = new StakingVerifyHarness();
        plan.chainId = block.chainid;
        plan.maxSupply = ARLAllocation.MAX_SUPPLY;
        plan.allocations = Allocations({
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
        plan.investors = VestingPlan(makeAddr("investorsSafe"), START, CLIFF_END, VESTING_END);
        plan.strategicPartnerships =
            VestingPlan(makeAddr("partnershipsSafe"), START, CLIFF_END, VESTING_END);
        plan.treasurySafe = makeAddr("treasurySafe");
        plan.treasuryGuardian = makeAddr("guardianSafe");
        plan.minDelay = 48 hours;
        plan.recipients = Recipients({
            publicLaunch: makeAddr("launchSafe"),
            communityStaking: makeAddr("communitySafe"),
            ecosystemGrowth: makeAddr("growthSafe"),
            liquidity: makeAddr("liquiditySafe"),
            founder: makeAddr("founderSafe"),
            team: makeAddr("teamPoolSafe"),
            earlyUsers: makeAddr("earlyUsersSafe"),
            grantsBugBounty: makeAddr("grantsSafe")
        });
        d = h.deploy(plan);
    }

    function _staking(address distributor) internal returns (ARLStakingRewards) {
        return new ARLStakingRewards(d.token, d.token, distributor, DURATION);
    }

    function test_VerifiesWhenDistributorIsCommunityStakingHolder() public {
        ARLStakingRewards s = _staking(plan.recipients.communityStaking);
        h.verify(plan, address(d.token), s, true);
        // The holder is the address the Community & Staking allocation was minted to.
        assertEq(
            d.token.balanceOf(plan.recipients.communityStaking), ARLAllocation.COMMUNITY_STAKING
        );
    }

    function test_RevertWhen_DistributorIsTheTreasuryTimelock() public {
        ARLStakingRewards s = _staking(address(d.timelock));
        _expectDistributorMismatch(address(d.timelock));
        h.verify(plan, address(d.token), s, true);
    }

    function test_RevertWhen_DistributorIsAnyOtherHolder() public {
        address[6] memory others = [
            plan.treasurySafe,
            plan.recipients.publicLaunch,
            plan.recipients.ecosystemGrowth,
            plan.recipients.liquidity,
            plan.recipients.founder,
            plan.recipients.earlyUsers
        ];
        for (uint256 i = 0; i < others.length; i++) {
            ARLStakingRewards s = _staking(others[i]);
            _expectDistributorMismatch(others[i]);
            h.verify(plan, address(d.token), s, true);
        }
    }

    function test_RevertWhen_StakingTokenIsNotARL() public {
        OtherToken other = new OtherToken();
        ARLStakingRewards s = new ARLStakingRewards(
            IERC20(address(other)), d.token, plan.recipients.communityStaking, DURATION
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLStakingVerify.StakingVerifyAddressMismatch.selector,
                "staking token is ARL",
                address(d.token),
                address(other)
            )
        );
        h.verify(plan, address(d.token), s, true);
    }

    function test_RevertWhen_RewardTokenIsNotARL() public {
        OtherToken other = new OtherToken();
        ARLStakingRewards s = new ARLStakingRewards(
            d.token, IERC20(address(other)), plan.recipients.communityStaking, DURATION
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLStakingVerify.StakingVerifyAddressMismatch.selector,
                "reward token is ARL",
                address(d.token),
                address(other)
            )
        );
        h.verify(plan, address(d.token), s, true);
    }

    function test_RevertWhen_StakingHasNoCode() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLStakingVerify.StakingVerifyFailed.selector, "staking has code"
            )
        );
        h.verify(plan, address(d.token), ARLStakingRewards(makeAddr("nothing")), true);
    }

    function test_RevertWhen_OtherChain() public {
        ARLStakingRewards s = _staking(plan.recipients.communityStaking);
        plan.chainId = block.chainid + 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLStakingVerify.StakingVerifyUintMismatch.selector,
                "chain id",
                block.chainid + 1,
                block.chainid
            )
        );
        h.verify(plan, address(d.token), s, true);
    }

    function test_FreshCheckFailsAfterFundingButDistributorCheckStillHolds() public {
        address holder = plan.recipients.communityStaking;
        ARLStakingRewards s = _staking(holder);
        vm.startPrank(holder);
        d.token.approve(address(s), 1_000 ether);
        s.notifyRewardAmount(1_000 ether);
        vm.stopPrank();
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLStakingVerify.StakingVerifyUintMismatch.selector,
                "nothing funded",
                0,
                1_000 ether
            )
        );
        h.verify(plan, address(d.token), s, true);
        h.verify(plan, address(d.token), s, false);
    }

    function _expectDistributorMismatch(address actual) internal {
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLStakingVerify.StakingVerifyAddressMismatch.selector,
                "distributor is the Community & Staking holder",
                plan.recipients.communityStaking,
                actual
            )
        );
    }
}
