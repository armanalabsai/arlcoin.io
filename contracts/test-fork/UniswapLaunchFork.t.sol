// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLToken} from "../src/ARLToken.sol";

// ABI-level declarations for Uniswap v3 on Base (Uniswap/v3-core, v3-periphery and
// swap-router-contracts, GPL-2.0-or-later / MIT). No implementation code is copied.
interface IUniswapV3Factory {
    function getPool(address a, address b, uint24 fee) external view returns (address);
}

interface IUniswapV3Pool {
    function slot0()
        external
        view
        returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool);
}

interface IPositionManager {
    function createAndInitializePoolIfNecessary(address, address, uint24, uint160)
        external
        payable
        returns (address);
    function balanceOf(address owner) external view returns (uint256);
}

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/// @notice Runs the Liquidity Safe's launch batch (written by `packages/deploy/src/pool-cli.ts`
/// from `test-fork/fixtures/pools.json`) against Uniswap v3 on a Base Mainnet fork, with the
/// real ARL token deployed at its expected address: ARL/USDC, ARL/USDT, ARL/WETH and ARL/cbBTC.
/// Nothing is broadcast. Run:
/// FOUNDRY_PROFILE=fork ARL_BASE_RPC=<Base Mainnet RPC> forge test --match-contract UniswapLaunchFork
contract UniswapLaunchForkTest is Test {
    address constant ARL = 0x0e8A5434f12D3d839a0a7E88d3a66b11bd712b97;
    address constant LIQUIDITY_SAFE = 0x220D3a21366FD386CEEEF4ba36c7aE6582AB3C18;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant FACTORY = 0x33128a8fC17869897dcE68Ed026d694621f6FDfD;
    address constant POSITION_MANAGER = 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1;
    address constant ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    uint24 constant FEE = 10_000;

    string batch;
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
        batch = vm.readFile("test-fork/fixtures/pool-batch.json");
        plan = vm.readFile("test-fork/fixtures/pool-batch.plan.json");
        while (vm.keyExistsJson(plan, string.concat(".legs[", vm.toString(legs), "]"))) legs++;

        ARLToken.Recipients memory r = ARLToken.Recipients({
            publicLaunch: makeAddr("publicLaunch"),
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
        assertEq(IERC20(ARL).balanceOf(LIQUIDITY_SAFE), 2_000_000e18);
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

    function _runBatch() internal {
        uint256 n = 2 * legs + 1;
        for (uint256 i = 0; i < n; i++) {
            string memory k = string.concat(".transactions[", vm.toString(i), "]");
            address to = vm.parseJsonAddress(batch, string.concat(k, ".to"));
            bytes memory data = vm.parseJsonBytes(batch, string.concat(k, ".data"));
            vm.prank(LIQUIDITY_SAFE);
            (bool ok, bytes memory ret) = to.call(data);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }

    function _buy(uint256 i, uint256 amountIn) internal returns (uint256 arlOut) {
        address quote = _quote(i);
        deal(quote, buyer, amountIn);
        vm.startPrank(buyer);
        IERC20(quote).approve(ROUTER, amountIn);
        arlOut = ISwapRouter02(ROUTER)
            .exactInputSingle(
                ISwapRouter02.ExactInputSingleParams(quote, ARL, FEE, buyer, amountIn, 0, 0)
            );
        vm.stopPrank();
    }

    /// @dev amountIn of the quote token paid for arlOut is at least the pool's floor, in raw
    /// units: amountIn / arlOut >= priceNum / priceDen.
    function _assertAtLeastFloor(uint256 i, uint256 amountIn, uint256 arlOut) internal view {
        uint256 num = vm.parseJsonUint(plan, _leg(i, "priceNum"));
        uint256 den = vm.parseJsonUint(plan, _leg(i, "priceDen"));
        assertGe(amountIn * den, arlOut * num, "ARL sold below the floor");
    }

    function test_BatchOpensAnArlOnlyPositionPerQuoteToken() public {
        assertEq(legs, 4);
        _runBatch();
        uint256 inPools;
        for (uint256 i = 0; i < legs; i++) {
            address pool = _pool(i);
            assertTrue(pool != address(0));
            (uint160 sqrtPrice, int24 tick,,,,,) = IUniswapV3Pool(pool).slot0();
            assertEq(uint256(sqrtPrice), vm.parseJsonUint(plan, _leg(i, "sqrtPriceX96")));
            assertEq(int256(tick), vm.parseJsonInt(plan, _leg(i, "tickLower")) - 1);
            uint256 amount = vm.parseJsonUint(plan, _leg(i, "arlAmountWei"));
            // Liquidity rounding over the full range leaves dust (about 1e-12 ARL) in the Safe.
            assertApproxEqAbs(IERC20(ARL).balanceOf(pool), amount, 1e9);
            assertEq(IERC20(_quote(i)).balanceOf(pool), 0);
            inPools += IERC20(ARL).balanceOf(pool);
        }
        assertEq(IPositionManager(POSITION_MANAGER).balanceOf(LIQUIDITY_SAFE), legs);
        assertEq(IERC20(ARL).balanceOf(LIQUIDITY_SAFE), 2_000_000e18 - inPools);
        assertLe(IERC20(ARL).allowance(LIQUIDITY_SAFE, POSITION_MANAGER), 1e10);
    }

    function test_BuyersPayAtLeastTheFloorInEveryPool() public {
        _runBatch();
        // About 1,000 USD in each quote token: USDC, USDT, WETH, cbBTC.
        uint256[4] memory amounts = [uint256(1_000e6), 1_000e6, 0.25 ether, 0.01e8];
        for (uint256 i = 0; i < legs; i++) {
            uint256 arlOut = _buy(i, amounts[i]);
            assertGt(arlOut, 0);
            _assertAtLeastFloor(i, amounts[i], arlOut);
        }
    }

    function test_SellersCannotPushThePriceBelowTheFloor() public {
        _runBatch();
        uint256 arlOut = _buy(0, 1_000e6);
        vm.startPrank(buyer);
        IERC20(ARL).approve(ROUTER, arlOut);
        uint256 back = ISwapRouter02(ROUTER)
            .exactInputSingle(
                ISwapRouter02.ExactInputSingleParams(ARL, USDC, FEE, buyer, arlOut, 0, 0)
            );
        vm.stopPrank();
        assertLe(back, 1_000e6);
        (, int24 tick,,,,,) = IUniswapV3Pool(_pool(0)).slot0();
        assertGe(int256(tick), vm.parseJsonInt(plan, _leg(0, "tickLower")) - 1);
    }

    /// @dev Someone creates a pool first at a price inside the range: the position would need the
    /// quote token, so the mint gets no liquidity and the whole batch reverts.
    function test_RevertWhen_PoolPreInitialisedInsideTheRange() public {
        _preInitialise(0, _sqrtAtTick(vm.parseJsonInt(plan, _leg(0, "tickLower")) + 10_000));
        vm.expectRevert();
        this.runBatchExternal();
    }

    /// @dev Pre-initialised above the range: the position would be all quote token, so the ARL
    /// minimum fails and the batch reverts.
    function test_RevertWhen_PoolPreInitialisedAboveTheRange() public {
        _preInitialise(2, uint160(vm.parseJsonUint(plan, _leg(2, "sqrtPriceX96"))) * 1000);
        vm.expectRevert();
        this.runBatchExternal();
    }

    /// @dev Pre-initialised far below the floor: the position still holds only ARL, and a buyer
    /// still pays at least the floor, because no ARL sits below the range.
    function test_PoolPreInitialisedBelowStillSellsAtTheFloor() public {
        _preInitialise(0, uint160(vm.parseJsonUint(plan, _leg(0, "sqrtPriceX96"))) / 10);
        _runBatch();
        uint256 arlOut = _buy(0, 1_000e6);
        _assertAtLeastFloor(0, 1_000e6, arlOut);
    }

    function runBatchExternal() external {
        _runBatch();
    }

    function _preInitialise(uint256 i, uint160 sqrtPrice) internal {
        vm.prank(makeAddr("attacker"));
        IPositionManager(POSITION_MANAGER)
            .createAndInitializePoolIfNecessary(ARL, _quote(i), FEE, sqrtPrice);
    }

    /// @dev Approximate sqrt price at a tick: sqrt(1.0001^t) * 2^96 = 2^(96 + t / 13863).
    function _sqrtAtTick(int256 t) internal pure returns (uint160) {
        int256 shifts = t / 13_863;
        uint256 q = 2 ** 96;
        if (shifts >= 0) return uint160(q << uint256(shifts));
        return uint160(q >> uint256(-shifts));
    }
}
