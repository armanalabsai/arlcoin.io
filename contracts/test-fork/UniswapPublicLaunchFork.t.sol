// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLToken} from "../src/ARLToken.sol";
import {
    IUniswapV3Factory,
    IUniswapV3Pool,
    IPositionManager,
    ISwapRouter02
} from "./UniswapLaunchFork.t.sol";

/// @notice The launch-day order with both pool batches on a Base Mainnet fork: the Liquidity
/// Safe's batch (1,000,000 ARL, `fixtures/pool-batch.json`) creates the four pools, then the
/// Public Launch Safe's batch (4,500,000 ARL, `fixtures/pool-batch-public-launch.json`, owner
/// decision 2026-10-10) adds its ARL-only positions on the same ranges. The Public Launch Safe
/// keeps its 500,000 ARL claim tranche. Nothing is broadcast. Run:
/// FOUNDRY_PROFILE=fork ARL_BASE_RPC=<Base Mainnet RPC> forge test --match-contract UniswapPublicLaunchFork
contract UniswapPublicLaunchForkTest is Test {
    address constant ARL = 0x0e8A5434f12D3d839a0a7E88d3a66b11bd712b97;
    address constant LIQUIDITY_SAFE = 0x220D3a21366FD386CEEEF4ba36c7aE6582AB3C18;
    address constant PUBLIC_LAUNCH_SAFE = 0xb9829b9145581042776fa65bbF56972447aCdB38;
    address constant USDT = 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2;
    address constant FACTORY = 0x33128a8fC17869897dcE68Ed026d694621f6FDfD;
    address constant POSITION_MANAGER = 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1;
    address constant ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    uint24 constant FEE = 10_000;

    string liquidityBatch;
    string publicBatch;
    string plan;
    uint256 legs;
    address buyer = makeAddr("buyer");

    function setUp() public {
        string memory rpc = vm.envOr("ARL_BASE_RPC", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        liquidityBatch = vm.readFile("test-fork/fixtures/pool-batch.json");
        publicBatch = vm.readFile("test-fork/fixtures/pool-batch-public-launch.json");
        plan = vm.readFile("test-fork/fixtures/pool-batch-public-launch.plan.json");
        while (vm.keyExistsJson(plan, string.concat(".legs[", vm.toString(legs), "]"))) legs++;

        ARLToken.Recipients memory r = ARLToken.Recipients({
            publicLaunch: PUBLIC_LAUNCH_SAFE,
            communityStaking: makeAddr("communityStaking"),
            ecosystemGrowth: makeAddr("ecosystemGrowth"),
            strategicPartnerships: makeAddr("strategicPartnerships"),
            liquidity: LIQUIDITY_SAFE,
            founder: makeAddr("founder"),
            investors: makeAddr("investors"),
            treasury: makeAddr("treasury"),
            team: makeAddr("team"),
            earlyUsers: makeAddr("earlyUsers"),
            grantsBugBounty: makeAddr("grantsBugBounty")
        });
        deployCodeTo("ARLToken.sol:ARLToken", abi.encode(r), ARL);
        assertEq(IERC20(ARL).balanceOf(PUBLIC_LAUNCH_SAFE), 5_000_000e18);
    }

    function _leg(uint256 i, string memory field) internal view returns (string memory) {
        return string.concat(".legs[", vm.toString(i), "].", field);
    }

    function _quote(uint256 i) internal view returns (address) {
        return vm.parseJsonAddress(plan, _leg(i, "token1"));
    }

    function _pool(uint256 i) internal view returns (address) {
        return IUniswapV3Factory(FACTORY).getPool(ARL, _quote(i), FEE);
    }

    function _run(string memory batch, address safe) internal {
        for (uint256 i = 0; i < 2 * legs + 1; i++) {
            string memory k = string.concat(".transactions[", vm.toString(i), "]");
            address to = vm.parseJsonAddress(batch, string.concat(k, ".to"));
            bytes memory data = vm.parseJsonBytes(batch, string.concat(k, ".data"));
            vm.prank(safe);
            (bool ok, bytes memory ret) = to.call(data);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }

    function _swap(address tokenIn, address tokenOut, uint256 amountIn)
        internal
        returns (uint256 out)
    {
        vm.startPrank(buyer);
        IERC20(tokenIn).approve(ROUTER, amountIn);
        out = ISwapRouter02(ROUTER)
            .exactInputSingle(
                ISwapRouter02.ExactInputSingleParams(tokenIn, tokenOut, FEE, buyer, amountIn, 0, 0)
            );
        vm.stopPrank();
    }

    function test_BothBatchesPlace5_5MillionArlAndThePublicLaunchSafeKeepsItsTranche() public {
        assertEq(legs, 4);
        _run(liquidityBatch, LIQUIDITY_SAFE);
        _run(publicBatch, PUBLIC_LAUNCH_SAFE);
        uint256 inPools;
        for (uint256 i = 0; i < legs; i++) {
            assertEq(IERC20(_quote(i)).balanceOf(_pool(i)), 0, "a pool holds a quote token");
            inPools += IERC20(ARL).balanceOf(_pool(i));
        }
        // Full-range liquidity rounding leaves dust (about 1e-12 ARL per position) in the Safes.
        assertApproxEqAbs(inPools, 5_500_000e18, 1e10);
        assertEq(IPositionManager(POSITION_MANAGER).balanceOf(PUBLIC_LAUNCH_SAFE), legs);
        assertEq(IPositionManager(POSITION_MANAGER).balanceOf(LIQUIDITY_SAFE), legs);
        assertApproxEqAbs(IERC20(ARL).balanceOf(PUBLIC_LAUNCH_SAFE), 500_000e18, 1e10);
        assertGe(IERC20(ARL).balanceOf(PUBLIC_LAUNCH_SAFE), 500_000e18);
    }

    function test_BuyersCanBuyAndSellBackAboveTheFloor() public {
        _run(liquidityBatch, LIQUIDITY_SAFE);
        _run(publicBatch, PUBLIC_LAUNCH_SAFE);
        uint256 paid = 10_000e6;
        deal(USDT, buyer, paid);
        uint256 arl = _swap(USDT, ARL, paid);
        // 10,000 USDT at or above 0.20 USD per ARL.
        assertGt(arl, 0);
        assertLe(arl, 50_000e18);
        uint256 back = _swap(ARL, USDT, arl);
        assertGt(back, 0, "selling back returned nothing");
        assertLe(back, paid, "a round trip returned more than was paid");
        (, int24 tick,,,,,) = IUniswapV3Pool(_pool(1)).slot0();
        assertGe(int256(tick), vm.parseJsonInt(plan, _leg(1, "tickLower")) - 1);
    }

    /// @dev If anyone trades between the two batches, the price is inside the range and the
    /// Public Launch batch reverts as a whole: nothing is deposited and the Safe keeps its ARL.
    function test_RevertWhen_TradedBetweenTheBatches() public {
        _run(liquidityBatch, LIQUIDITY_SAFE);
        deal(USDT, buyer, 1_000e6);
        _swap(USDT, ARL, 1_000e6);
        uint256 before = IERC20(ARL).balanceOf(PUBLIC_LAUNCH_SAFE);
        vm.expectRevert();
        this.runPublicBatch();
        assertEq(IERC20(ARL).balanceOf(PUBLIC_LAUNCH_SAFE), before);
    }

    function runPublicBatch() external {
        _run(publicBatch, PUBLIC_LAUNCH_SAFE);
    }
}
