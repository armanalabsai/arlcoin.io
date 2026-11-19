"use client";

import { useState } from "react";
import type { Address } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import { Arl, Facts, PageTitle, RequireWallet, Stat, useChainTime } from "~~/components/arl/ui";
import { formatDate, timeLeft } from "~~/lib/format";
import {
  ARL,
  BASE_CHAIN_ID,
  POOL,
  POOL_ABI,
  POSITIONS,
  POSITIONS_ABI,
  PROGRAMME,
  PROGRAMME_ID,
  STAKER,
  STAKER_ABI,
  USDT,
  exitCalls,
  inRange,
  isPoolPosition,
  parseTokenId,
  programmeState,
  stakeData,
} from "~~/lib/lpRewards";

const UNISWAP_ADD = `https://app.uniswap.org/add/${ARL}/${USDT}/10000?chain=base`;
const base = { chainId: BASE_CHAIN_ID } as const;
/** Positions listed from the wallet; a wallet with more types its id instead. */
const MAX_LISTED = 12;

/** The position ids this wallet staked from this browser. */
function readIds(key: string): string[] {
  if (!key || typeof window === "undefined") return [];
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default function LiquidityPage() {
  return (
    <>
      <PageTitle title="Liquidity rewards">
        Provide liquidity to the official ARL/USDT pool on Uniswap v3 and earn ARL for every second
        your position is in range. Rewards come from the Community &amp; Staking allocation, never
        from new issuance. You can take your position back at any time.
      </PageTitle>
      <RequireWallet>
        <Liquidity />
      </RequireWallet>
    </>
  );
}

function Liquidity() {
  const { address, chainId } = useAccount();
  const now = useChainTime();
  const { switchChain } = useSwitchChain();
  const client = usePublicClient(base);
  const { writeContractAsync, isPending } = useWriteContract();
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);
  const typedId = parseTokenId(text);

  const programme = useReadContract({
    ...base,
    address: STAKER,
    abi: STAKER_ABI,
    functionName: "incentives",
    args: [PROGRAMME_ID],
  });
  const slot0 = useReadContract({ ...base, address: POOL, abi: POOL_ABI, functionName: "slot0" });
  const tick = slot0.data?.[1];

  const count = useReadContract({
    ...base,
    address: POSITIONS,
    abi: POSITIONS_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const listed = Number(count.data ?? 0n) > MAX_LISTED ? MAX_LISTED : Number(count.data ?? 0n);
  const owned = useReadContracts({
    contracts: Array.from({ length: listed }, (_, i) => ({
      ...base,
      address: POSITIONS,
      abi: POSITIONS_ABI,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [address as Address, BigInt(i)] as const,
    })),
    query: { enabled: !!address && listed > 0 },
  });
  const ownedIds = (owned.data ?? []).flatMap((r) => (r.status === "success" ? [r.result] : []));

  // The position the page acts on: the id typed by the user.
  const position = useReadContract({
    ...base,
    address: POSITIONS,
    abi: POSITIONS_ABI,
    functionName: "positions",
    args: typedId ? [typedId] : undefined,
    query: { enabled: !!typedId },
  });
  const deposit = useReadContract({
    ...base,
    address: STAKER,
    abi: STAKER_ABI,
    functionName: "deposits",
    args: typedId ? [typedId] : undefined,
    query: { enabled: !!typedId },
  });
  const stakedByMe =
    !!address && deposit.data?.[0].toLowerCase() === address.toLowerCase() && !!typedId;
  const reward = useReadContract({
    ...base,
    address: STAKER,
    abi: STAKER_ABI,
    functionName: "getRewardInfo",
    args: typedId ? [PROGRAMME, typedId] : undefined,
    query: { enabled: stakedByMe, refetchInterval: 15_000 },
  });
  const claimable = useReadContract({
    ...base,
    address: STAKER,
    abi: STAKER_ABI,
    functionName: "rewards",
    args: address ? [ARL, address] : undefined,
    query: { enabled: !!address },
  });

  // Remembers the ids this wallet staked from this browser, so they are one tap away later.
  const storeKey = address ? `arl-lp-staked:${address.toLowerCase()}` : "";
  // Written ids are kept in state with the wallet they belong to; any other wallet reads storage.
  const [saved, setSaved] = useState<{ key: string; ids: string[] }>();
  const remembered = saved?.key === storeKey ? saved.ids : readIds(storeKey);
  const remember = (ids: string[]) => {
    try {
      window.localStorage.setItem(storeKey, JSON.stringify(ids));
    } catch {
      // Private browsing: the list simply is not kept.
    }
    setSaved({ key: storeKey, ids });
  };

  const state = now !== undefined ? programmeState(now) : undefined;
  const p = position.data;
  const fits = p ? isPoolPosition(p[2], p[3], p[4]) : undefined;
  const earning = p && tick !== undefined ? inRange(tick, p[5], p[6]) : undefined;
  const busy = isPending || working;
  const wrongChain = chainId !== BASE_CHAIN_ID;

  async function run(label: string, send: () => Promise<`0x${string}`>, after?: () => void) {
    setNote("");
    setWorking(true);
    try {
      const hash = await send();
      await client?.waitForTransactionReceipt({ hash });
      after?.();
      setNote(`${label}: confirmed.`);
      await Promise.all([
        deposit.refetch(),
        reward.refetch(),
        claimable.refetch(),
        count.refetch(),
        programme.refetch(),
      ]);
    } catch (e) {
      const m = e instanceof Error ? (e.message.split("\n")[0] ?? e.message) : String(e);
      setNote(`${label} did not go through: ${m}`);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Facts>
        <Stat
          label="Programme"
          value={
            state === undefined
              ? "…"
              : state === "before"
                ? "Starts soon"
                : state === "running"
                  ? "Running"
                  : "Ended"
          }
          testId="lp-state"
          hint={
            now !== undefined
              ? state === "before"
                ? `Starts ${formatDate(PROGRAMME.startTime)}`
                : state === "running"
                  ? timeLeft(now, PROGRAMME.endTime)
                  : undefined
              : undefined
          }
        />
        <Stat
          label="Rewards still to earn"
          value={<Arl value={programme.data?.[0]} decimals={0} />}
          testId="lp-remaining"
          hint="What is not earned returns to the Community & Staking Safe"
        />
        <Stat
          label="Positions staked"
          value={programme.data ? programme.data[2].toString() : "…"}
        />
        <Stat label="Ends" value={formatDate(PROGRAMME.endTime)} />
        <Stat
          label="Your ARL ready to claim"
          value={<Arl value={claimable.data} />}
          testId="lp-claimable"
        />
      </Facts>

      <section className="glass-strong flex flex-col gap-3 p-5 text-sm">
        <h2 className="text-base font-semibold">How it works</h2>
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          <li>
            Open a position in the ARL/USDT pool (1% fee tier) on Uniswap, with a price range around
            the current price. It needs both ARL and USDT.{" "}
            <a className="link" href={UNISWAP_ADD} target="_blank" rel="noopener noreferrer">
              Open Uniswap
            </a>
          </li>
          <li>Come back here, pick the position and stake it.</li>
          <li>
            It earns ARL while the price is inside its range. Take it back whenever you like: one
            transaction returns the position and pays the ARL earned.
          </li>
        </ol>
        <p className="text-xs text-subtle">
          Providing liquidity carries risk: the mix of ARL and USDT in your position changes with
          the price, and a position outside its range earns nothing. This is not financial advice.
        </p>
      </section>

      <section className="glass-strong flex flex-col gap-4 p-5">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Uniswap position ID</span>
          <input
            className="input input-bordered w-full"
            inputMode="numeric"
            placeholder="for example 1234567"
            value={text}
            data-testid="lp-token-id"
            onChange={(e) => {
              setText(e.target.value);
              setNote("");
            }}
          />
        </label>

        {ownedIds.length > 0 || remembered.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-sm" data-testid="lp-picks">
            {ownedIds.map((id) => (
              <button
                key={`o-${id.toString()}`}
                type="button"
                className="btn btn-glass"
                onClick={() => setText(id.toString())}
              >
                In wallet: {id.toString()}
              </button>
            ))}
            {remembered.map((id) => (
              <button
                key={`s-${id}`}
                type="button"
                className="btn btn-glass"
                onClick={() => setText(id)}
              >
                Staked: {id}
              </button>
            ))}
          </div>
        ) : null}

        {typedId && p ? (
          <Facts inset>
            <Stat
              label="Pool"
              value={fits ? "ARL / USDT 1%" : "Another pool"}
              hint={fits ? undefined : "Only ARL/USDT 1% positions earn in this programme"}
            />
            <Stat label="Liquidity" value={p[7] > 0n ? "Active" : "Empty"} />
            <Stat
              label="Price in range"
              value={earning === undefined ? "…" : earning ? "Yes, earning" : "No, not earning"}
              testId="lp-in-range"
            />
            <Stat label="Staked here" value={stakedByMe ? "Yes" : "No"} />
            {stakedByMe ? (
              <Stat
                label="Earned by this position"
                value={<Arl value={reward.data?.[0]} />}
                testId="lp-earned"
              />
            ) : null}
          </Facts>
        ) : null}

        {wrongChain ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => switchChain({ chainId: BASE_CHAIN_ID })}
          >
            Switch to Base
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              data-testid="lp-stake"
              disabled={busy || !typedId || !address || !fits || stakedByMe || state !== "running"}
              onClick={() => {
                if (!typedId || !address) return;
                void run(
                  "Stake",
                  () =>
                    writeContractAsync({
                      ...base,
                      address: POSITIONS,
                      abi: POSITIONS_ABI,
                      functionName: "safeTransferFrom",
                      args: [address, STAKER, typedId, stakeData()],
                    }),
                  () => remember([...new Set([...remembered, typedId.toString()])]),
                );
              }}
            >
              Stake position
            </button>
            <button
              type="button"
              className="btn btn-glass"
              data-testid="lp-exit"
              disabled={busy || !stakedByMe || !typedId || !address}
              onClick={() => {
                if (!typedId || !address) return;
                void run(
                  "Unstake and claim",
                  () =>
                    writeContractAsync({
                      ...base,
                      address: STAKER,
                      abi: STAKER_ABI,
                      functionName: "multicall",
                      args: [exitCalls(typedId, address)],
                    }),
                  () => remember(remembered.filter((x) => x !== typedId.toString())),
                );
              }}
            >
              Unstake, claim and take back
            </button>
            <button
              type="button"
              className="btn btn-glass"
              data-testid="lp-claim"
              disabled={busy || !claimable.data || !address}
              onClick={() => {
                if (!address) return;
                void run("Claim", () =>
                  writeContractAsync({
                    ...base,
                    address: STAKER,
                    abi: STAKER_ABI,
                    functionName: "claimReward",
                    args: [ARL, address, 0n],
                  }),
                );
              }}
            >
              Claim ARL
            </button>
          </div>
        )}
        {state === "before" ? (
          <p className="text-sm text-muted">Staking opens when the programme starts.</p>
        ) : null}
        {note ? (
          <p className="text-sm text-muted" role="status" data-testid="lp-note">
            {note}
          </p>
        ) : null}
      </section>
    </div>
  );
}
