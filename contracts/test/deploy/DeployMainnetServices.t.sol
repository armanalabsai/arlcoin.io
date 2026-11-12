// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {ARLStakingRewards} from "../../src/ARLStakingRewards.sol";
import {ComputePayment} from "../../src/ComputePayment.sol";
import {DeployMainnetServices} from "../../script/DeployMainnetServices.s.sol";

contract ServicesTestToken is ERC20 {
    constructor() ERC20("Test", "TST") {}
}

contract FakeSafe {
    uint256 public immutable getThreshold;

    constructor(uint256 threshold) {
        getThreshold = threshold;
    }
}

contract DeployMainnetServicesTest is Test {
    DeployMainnetServices internal script;
    ServicesTestToken internal token;
    address internal distribution = makeAddr("distribution");

    function setUp() public {
        vm.chainId(31_337);
        script = new DeployMainnetServices();
        token = new ServicesTestToken();
    }

    function test_localDeployWiresBothContracts() public {
        // Explicit inputs: other suites set ARL_* environment variables in parallel.
        (ComputePayment payment, ARLStakingRewards staking) =
            script.deploy(address(token), distribution, 180 days);
        assertEq(address(payment.paymentToken()), address(token));
        assertEq(payment.streamCounter(), 0);
        assertEq(address(staking.stakingToken()), address(token));
        assertEq(address(staking.rewardsToken()), address(token));
        assertEq(staking.rewardsDistribution(), distribution);
        assertEq(staking.rewardsDuration(), 180 days);
        assertEq(staking.totalSupply(), 0);
    }

    function test_defaultPeriodIsOneHundredAndEightyDays() public view {
        assertEq(script.DEFAULT_REWARDS_DURATION(), 180 days);
    }

    function test_refusesOtherChains() public {
        vm.chainId(84_532);
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnetServices.ChainNotAllowed.selector, 84_532)
        );
        script.check(address(token), distribution, 180 days);
    }

    function test_refusesATokenWithoutCode() public {
        address none = makeAddr("none");
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnetServices.NoCode.selector, "token", none)
        );
        script.check(none, distribution, 180 days);
    }

    function _mainnet() internal returns (address arl, address safe) {
        vm.chainId(8453);
        vm.warp(2_000_000_000);
        arl = script.ARL_TOKEN();
        safe = script.COMMUNITY_STAKING_SAFE();
        vm.etch(arl, address(token).code);
    }

    function test_mainnetAcceptsOnlyTheArlToken() public {
        (, address safe) = _mainnet();
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnetServices.WrongToken.selector, address(token))
        );
        script.check(address(token), safe, 180 days);
    }

    function test_mainnetAcceptsOnlyTheCommunityStakingSafe() public {
        (address arl,) = _mainnet();
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnetServices.WrongDistribution.selector, distribution)
        );
        script.check(arl, distribution, 180 days);
    }

    function test_mainnetAcceptsOnlyTheApprovedPeriod() public {
        (address arl, address safe) = _mainnet();
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnetServices.WrongDistribution.selector, safe)
        );
        script.check(arl, safe, 365 days);
    }

    function test_mainnetRefusesADistributorThatIsNotASafe() public {
        (address arl, address safe) = _mainnet();
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnetServices.DistributionNotASafe.selector, safe)
        );
        script.check(arl, safe, 180 days);

        vm.etch(safe, hex"00");
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnetServices.DistributionNotASafe.selector, safe)
        );
        script.check(arl, safe, 180 days);
    }

    function test_mainnetRefusesASafeOfOneSignature() public {
        (address arl, address safe) = _mainnet();
        vm.etch(safe, address(new FakeSafe(1)).code);
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnetServices.DistributionThresholdTooLow.selector, 1)
        );
        script.check(arl, safe, 180 days);
    }

    function test_mainnetAcceptsTheSafeOfTwoSignatures() public {
        (address arl, address safe) = _mainnet();
        vm.etch(safe, address(new FakeSafe(2)).code);
        script.check(arl, safe, 180 days);
    }
}
