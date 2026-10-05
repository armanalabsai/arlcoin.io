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
    function initialize(uint160 sqrtPriceX96) external;
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

/// @notice Runs the Liquidity Safe's launch batch (written by `packages/deploy/src/pool-cli.ts`)
/// against Uniswap v3 on a Base Mainnet fork, with the real ARL token deployed at its expected
/// address. Nothing is broadcast. Run:
/// FOUNDRY_PROFILE=fork ARL_BASE_RPC=<Base Mainnet RPC> forge test --match-contract UniswapLaunchFork
contract UniswapLaunchForkTest is Test {
    address constant ARL = 0x0e8A5434f12D3d839a0a7E88d3a66b11bd712b97;
    address constant LIQUIDITY_SAFE = 0x220D3a21366FD386CEEEF4ba36c7aE6582AB3C18;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant FACTORY = 0x33128a8fC17869897dcE68Ed026d694621f6FDfD;
    address constant POSITION_MANAGER = 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1;
    address constant ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    uint24 constant FEE = 10_000;
    uint256 constant AMOUNT = 500_000e18;

    string batch;
    address buyer = makeAddr("buyer");

    function setUp() public {
        string memory rpc = vm.envOr("ARL_BASE_RPC", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        batch = vm.readFile("test-fork/fixtures/pool-batch.json");

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

    function _runBatch() internal {
        for (uint256 i = 0; i < 3; i++) {
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

    function _buy(uint256 usdcIn) internal returns (uint256 arlOut) {
        deal(USDC, buyer, usdcIn);
        vm.startPrank(buyer);
        IERC20(USDC).approve(ROUTER, usdcIn);
        arlOut = ISwapRouter02(ROUTER)
            .exactInputSingle(
                ISwapRouter02.ExactInputSingleParams(USDC, ARL, FEE, buyer, usdcIn, 0, 0)
            );
        vm.stopPrank();
    }

    /// @dev usdc (6 decimals) paid for arl (18 decimals) is at least 0.20 USD per ARL.
    function _assertAtLeastListingPrice(uint256 usdc, uint256 arl) internal pure {
        // usdc / 1e6 >= 0.20 * arl / 1e18  <=>  usdc * 1e13 >= arl * 2
        assertGe(usdc * 1e13, arl * 2, "ARL sold below 0.20 USD");
    }

    function test_BatchOpensAnArlOnlyPositionFromTheListingPrice() public {
        _runBatch();
        address pool = IUniswapV3Factory(FACTORY).getPool(ARL, USDC, FEE);
        assertTrue(pool != address(0));
        (uint160 sqrtPrice, int24 tick,,,,,) = IUniswapV3Pool(pool).slot0();
        assertEq(uint256(sqrtPrice), vm.parseJsonUint(_plan(), ".sqrtPriceX96"));
        assertEq(int256(tick), vm.parseJsonInt(_plan(), ".tickLower") - 1);
        assertEq(IPositionManager(POSITION_MANAGER).balanceOf(LIQUIDITY_SAFE), 1);
        // Liquidity rounding over the full range leaves dust (about 1e-12 ARL) in the Safe.
        assertApproxEqAbs(IERC20(ARL).balanceOf(pool), AMOUNT, 1e9);
        assertEq(IERC20(USDC).balanceOf(pool), 0);
        assertEq(IERC20(ARL).balanceOf(LIQUIDITY_SAFE), 2_000_000e18 - IERC20(ARL).balanceOf(pool));
        assertLe(IERC20(ARL).allowance(LIQUIDITY_SAFE, POSITION_MANAGER), 1e9);
    }

    function test_BuyersPayAtLeastTheListingPriceAndSellersCannotPushItBelow() public {
        _runBatch();
        uint256 arlOut = _buy(1_000e6);
        assertGt(arlOut, 0);
        _assertAtLeastListingPrice(1_000e6, arlOut);

        // Selling everything back returns at most what was paid; no USDC exists below 0.20.
        vm.startPrank(buyer);
        IERC20(ARL).approve(ROUTER, arlOut);
        uint256 usdcBack = ISwapRouter02(ROUTER)
            .exactInputSingle(
                ISwapRouter02.ExactInputSingleParams(ARL, USDC, FEE, buyer, arlOut, 0, 0)
            );
        vm.stopPrank();
        assertLe(usdcBack, 1_000e6);
        address pool = IUniswapV3Factory(FACTORY).getPool(ARL, USDC, FEE);
        (, int24 tick,,,,,) = IUniswapV3Pool(pool).slot0();
        assertGe(int256(tick), vm.parseJsonInt(_plan(), ".tickLower") - 1);
    }

    /// @dev Someone creates the pool first at a price inside the range: the position would need
    /// USDC, so the mint gets no liquidity and the batch reverts. Nothing is deposited.
    function test_RevertWhen_PoolPreInitialisedInsideTheRange() public {
        _preInitialise(_sqrtAtTick(vm.parseJsonInt(_plan(), ".tickLower") + 10_000));
        vm.expectRevert();
        this.runBatchExternal();
    }

    /// @dev Pre-initialised above the range: the position would be all USDC, so the ARL minimum
    /// fails and the batch reverts.
    function test_RevertWhen_PoolPreInitialisedAboveTheRange() public {
        _preInitialise(uint160(vm.parseJsonUint(_plan(), ".sqrtPriceX96")) * 1000);
        vm.expectRevert();
        this.runBatchExternal();
    }

    /// @dev Pre-initialised far below the listing price: the position still holds only ARL, and a
    /// buyer still pays at least 0.20 USD per ARL, because no ARL sits below the range.
    function test_PoolPreInitialisedBelowStillSellsAtTheListingPrice() public {
        _preInitialise(uint160(vm.parseJsonUint(_plan(), ".sqrtPriceX96")) / 10);
        _runBatch();
        uint256 arlOut = _buy(1_000e6);
        _assertAtLeastListingPrice(1_000e6, arlOut);
    }

    function runBatchExternal() external {
        _runBatch();
    }

    function _preInitialise(uint160 sqrtPrice) internal {
        vm.prank(makeAddr("attacker"));
        IPositionManager(POSITION_MANAGER)
            .createAndInitializePoolIfNecessary(ARL, USDC, FEE, sqrtPrice);
    }

    function _plan() internal view returns (string memory) {
        return vm.readFile("test-fork/fixtures/pool-batch.plan.json");
    }

    /// @dev Approximate sqrt price at a tick, good enough to place a price inside the range.
    function _sqrtAtTick(int256 t) internal pure returns (uint160) {
        // sqrt(1.0001^t) * 2^96 via the plan's own lower bound: shift by 2^(t/13863)
        // (1.0001^6931.8 ~ 2), applied to 2^96.
        int256 shifts = t / 13_863;
        uint256 q = 2 ** 96;
        if (shifts >= 0) return uint160(q << uint256(shifts));
        return uint160(q >> uint256(-shifts));
    }
}
