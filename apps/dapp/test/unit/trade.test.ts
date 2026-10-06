import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeFunctionData } from "viem";

import {
  QUOTE_TOKENS,
  TGE_DATE,
  TradeError,
  UNISWAP,
  mainnetToken,
  minimumOut,
  pricePerArl,
  quoteArgs,
  route,
  routerAbi,
  swapCall,
  tradingOpen,
} from "../../lib/trade.ts";

const ARL = "0x0e8A5434f12D3d839a0a7E88d3a66b11bd712b97";
const USER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const TGE = Date.parse(TGE_DATE);

describe("trade", () => {
  it("stays closed until the token is set and the TGE has passed", () => {
    assert.equal(mainnetToken(undefined), null);
    assert.equal(mainnetToken(""), null);
    assert.equal(mainnetToken(ARL.toLowerCase()), ARL);
    assert.throws(() => mainnetToken("0x1234"), TradeError);
    assert.throws(() => mainnetToken("0x0000000000000000000000000000000000000000"), TradeError);
    assert.equal(tradingOpen(null, TGE), false);
    assert.equal(tradingOpen(ARL, TGE - 1), false);
    assert.equal(tradingOpen(ARL, TGE), true);
  });

  it("offers the four official quote tokens", () => {
    assert.deepEqual(
      QUOTE_TOKENS.map((q) => [q.symbol, q.decimals]),
      [
        ["USDC", 6],
        ["USDT", 6],
        ["WETH", 18],
        ["cbBTC", 8],
      ],
    );
  });

  it("routes buys from the quote token to ARL and sells the other way", () => {
    const buy = route(ARL, "USDC", "buy");
    assert.equal(buy.tokenIn.symbol, "USDC");
    assert.equal(buy.tokenOut.address, ARL);
    const sell = route(ARL, "WETH", "sell");
    assert.equal(sell.tokenIn.address, ARL);
    assert.equal(sell.tokenOut.symbol, "WETH");
  });

  it("applies slippage by rounding down, within 0 to 10%", () => {
    assert.equal(minimumOut(10_000n, 100), 9_900n);
    assert.equal(minimumOut(999n, 100), 989n);
    assert.equal(minimumOut(5n, 0), 5n);
    assert.throws(() => minimumOut(10_000n, 1_001), TradeError);
    assert.throws(() => minimumOut(10_000n, -1), TradeError);
    assert.throws(() => minimumOut(0n, 100), TradeError);
  });

  it("encodes an exact-input swap to the user through SwapRouter02 at the 1% pool", () => {
    const usdc = QUOTE_TOKENS[0].address;
    const call = swapCall(usdc, ARL, 1_000_000n, 4_900_000_000_000_000_000n, USER);
    assert.equal(call.to, UNISWAP.swapRouter02);
    const { args } = decodeFunctionData({ abi: routerAbi, data: call.data });
    assert.deepEqual(args[0], {
      tokenIn: usdc,
      tokenOut: ARL,
      fee: 10_000,
      recipient: USER,
      amountIn: 1_000_000n,
      amountOutMinimum: 4_900_000_000_000_000_000n,
      sqrtPriceLimitX96: 0n,
    });
    assert.throws(() => swapCall(usdc, ARL, 0n, 1n, USER), TradeError);
    assert.throws(() => swapCall(usdc, ARL, 1n, 0n, USER), TradeError);
    assert.throws(() => quoteArgs(usdc, ARL, 0n), TradeError);
  });

  it("shows the price per ARL in the quote token", () => {
    // 1 USDC for 5 ARL is 0.20 USDC per ARL, either side.
    assert.equal(pricePerArl("buy", 1_000_000n, 5n * 10n ** 18n, 6), 0.2);
    assert.equal(pricePerArl("sell", 5n * 10n ** 18n, 1_000_000n, 6), 0.2);
    assert.equal(pricePerArl("buy", 1n, 0n, 6), 0);
  });
});
