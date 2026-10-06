"use client";

import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, parseUnits, type Address } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import { Facts, PageTitle, RequireWallet, Stat } from "~~/components/arl/ui";
import {
  BASE_CHAIN_ID,
  DEFAULT_SLIPPAGE_BPS,
  QUOTE_TOKENS,
  TGE_DATE,
  UNISWAP,
  mainnetToken,
  minimumOut,
  pricePerArl,
  quoteArgs,
  quoterAbi,
  route,
  routerAbi,
  tradingOpen,
  type QuoteSymbol,
  type Side,
} from "~~/lib/trade";

const TOKEN = mainnetToken(process.env.NEXT_PUBLIC_ARL_MAINNET_TOKEN);

export default function TradePage() {
  // Read once when the page mounts; the TGE is a date, not a countdown.
  const [now] = useState(() => Date.now());
  return (
    <>
      <PageTitle title="Trade">
        Buy and sell ARL in the official Uniswap v3 pools on Base: ARL against USDC, USDT, WETH and
        cbBTC. Swaps go from your own wallet straight to Uniswap; ARL never holds your funds.
      </PageTitle>
      {tradingOpen(TOKEN, now) && TOKEN ? (
        <RequireWallet>
          <Trade token={TOKEN} />
        </RequireWallet>
      ) : (
        <div className="glass-strong p-8 text-center text-muted" data-testid="trade-closed">
          Trading opens with the Base Mainnet launch on {TGE_DATE.slice(0, 10)}. Until then no ARL
          exists on Base Mainnet: any token offered as ARL there today is not ARL.
        </div>
      )}
    </>
  );
}

function Trade({ token }: { token: Address }) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();

  const [symbol, setSymbol] = useState<QuoteSymbol>("USDC");
  const [side, setSide] = useState<Side>("buy");
  const [text, setText] = useState("");
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  // The quote is kept with the inputs it was read for, so a stale one is never shown.
  const [quoted, setQuoted] = useState<{ key: string; value: bigint } | undefined>();
  const [note, setNote] = useState("");

  const { tokenIn, tokenOut } = route(token, symbol, side);
  let amountIn = 0n;
  try {
    amountIn = text.trim() ? parseUnits(text.trim(), tokenIn.decimals) : 0n;
  } catch {
    amountIn = 0n;
  }

  const key = `${tokenIn.address}:${tokenOut.address}:${amountIn.toString()}`;
  const quote = quoted?.key === key ? quoted.value : undefined;

  const { data: balanceIn, refetch: refetchIn } = useReadContract({
    chainId: BASE_CHAIN_ID,
    address: tokenIn.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    chainId: BASE_CHAIN_ID,
    address: tokenIn.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, UNISWAP.swapRouter02] : undefined,
  });

  useEffect(() => {
    let live = true;
    if (!client || amountIn <= 0n) return;
    const timer = setTimeout(() => {
      client
        .simulateContract({
          address: UNISWAP.quoterV2,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: quoteArgs(tokenIn.address, tokenOut.address, amountIn),
        })
        .then((r) => {
          if (live) setQuoted({ key, value: r.result[0] });
        })
        .catch(() => {
          if (live) setQuoted({ key, value: 0n });
        });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [client, key, amountIn, tokenIn.address, tokenOut.address]);

  const onBase = chainId === BASE_CHAIN_ID;
  const enough = balanceIn !== undefined && amountIn > 0n && amountIn <= balanceIn;
  const needsApproval = allowance !== undefined && amountIn > allowance;
  const quoteDecimals = side === "buy" ? tokenIn.decimals : tokenOut.decimals;

  async function submit() {
    if (!address || !quote || quote <= 0n) return;
    setNote("");
    try {
      if (needsApproval) {
        await writeContractAsync({
          chainId: BASE_CHAIN_ID,
          address: tokenIn.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [UNISWAP.swapRouter02, amountIn],
        });
        await refetchAllowance();
      }
      await writeContractAsync({
        chainId: BASE_CHAIN_ID,
        address: UNISWAP.swapRouter02,
        abi: routerAbi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            fee: 10_000,
            recipient: address,
            amountIn,
            amountOutMinimum: minimumOut(quote, slippageBps),
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      setNote("Swap sent. Check your wallet for the confirmation.");
      setText("");
      await refetchIn();
    } catch (e) {
      setNote(e instanceof Error ? (e.message.split("\n")[0] ?? "Swap failed.") : "Swap failed.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="glass-strong flex flex-col gap-4 p-6">
        <div className="join w-full" role="tablist" aria-label="Side">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={side === s}
              data-testid={`trade-${s}`}
              className={`btn join-item grow ${side === s ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setSide(s)}
            >
              {s === "buy" ? "Buy ARL" : "Sell ARL"}
            </button>
          ))}
        </div>
        <label className="text-sm text-muted" htmlFor="trade-pair">
          {side === "buy" ? "Pay with" : "Receive"}
        </label>
        <select
          id="trade-pair"
          data-testid="trade-pair"
          className="select glass-field w-full"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value as QuoteSymbol)}
        >
          {QUOTE_TOKENS.map((q) => (
            <option key={q.symbol} value={q.symbol}>
              {q.symbol}
            </option>
          ))}
        </select>
        <label className="text-sm text-muted" htmlFor="trade-amount">
          Amount of {tokenIn.symbol}
          {balanceIn !== undefined ? (
            <span className="float-right">
              Available: {formatUnits(balanceIn, tokenIn.decimals)}
            </span>
          ) : null}
        </label>
        <input
          id="trade-amount"
          data-testid="trade-amount"
          className="input glass-field w-full"
          inputMode="decimal"
          placeholder="0.0"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <label className="text-sm text-muted" htmlFor="trade-slippage">
          Slippage tolerance (%)
        </label>
        <select
          id="trade-slippage"
          className="select glass-field w-full"
          value={slippageBps}
          onChange={(e) => setSlippageBps(Number(e.target.value))}
        >
          {[50, 100, 200, 500].map((b) => (
            <option key={b} value={b}>
              {(b / 100).toFixed(1)}
            </option>
          ))}
        </select>
        {!onBase ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => switchChain({ chainId: BASE_CHAIN_ID })}
          >
            Switch to Base
          </button>
        ) : (
          <button
            type="button"
            data-testid="trade-submit"
            className="btn btn-primary"
            disabled={!enough || !quote || quote <= 0n || isPending}
            onClick={() => void submit()}
          >
            {isPending
              ? "Confirm in your wallet"
              : needsApproval
                ? `Approve and ${side === "buy" ? "buy" : "sell"}`
                : side === "buy"
                  ? "Buy ARL"
                  : "Sell ARL"}
          </button>
        )}
        {note ? (
          <p role="status" className="text-sm break-words text-muted">
            {note}
          </p>
        ) : null}
      </div>
      <Facts>
        <Stat
          label="You receive (estimate)"
          value={
            quote === undefined
              ? "—"
              : quote === 0n
                ? "No liquidity for this amount"
                : `${formatUnits(quote, tokenOut.decimals)} ${tokenOut.symbol}`
          }
          testId="trade-quote"
        />
        <Stat
          label="Minimum after slippage"
          value={
            quote && quote > 0n
              ? `${formatUnits(minimumOut(quote, slippageBps), tokenOut.decimals)} ${tokenOut.symbol}`
              : "—"
          }
          testId="trade-minimum"
        />
        <Stat
          label={`Price per ARL (${symbol})`}
          value={
            quote && quote > 0n
              ? pricePerArl(side, amountIn, quote, quoteDecimals).toPrecision(6)
              : "—"
          }
          testId="trade-price"
        />
      </Facts>
      <p className="text-xs text-subtle">
        Pool fee 1%. Prices move with every trade. No independent audit of ARL has been performed;
        tokens can lose all their value. Only the ARL contract {token} is ARL.
      </p>
    </div>
  );
}
