"use client";

import { useAccount } from "wagmi";

import {
  AmountForm,
  Facts,
  Arl,
  PageTitle,
  RequireWallet,
  Stat,
  useChainTime,
} from "~~/components/arl/ui";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useScaffoldWriteContract,
} from "~~/hooks/scaffold-eth";
import { formatDate, percent, rewardPerDay, timeLeft } from "~~/lib/format";

export default function StakingPage() {
  return (
    <>
      <PageTitle title="Staking">
        Stake ARL to earn ARL rewards from the current reward period. Rewards accrue every second,
        pro rata to your share of the total staked. You can withdraw at any time.
      </PageTitle>
      <RequireWallet>
        <Staking />
      </RequireWallet>
    </>
  );
}

function Staking() {
  const { address } = useAccount();
  const now = useChainTime();
  const { data: staking } = useDeployedContractInfo({ contractName: "ARLStakingRewards" });
  const s = { contractName: "ARLStakingRewards" } as const;
  const { data: walletBalance } = useScaffoldReadContract({
    contractName: "ARLToken",
    functionName: "balanceOf",
    args: [address],
  });
  const { data: allowance } = useScaffoldReadContract({
    contractName: "ARLToken",
    functionName: "allowance",
    args: [address, staking?.address],
  });
  const { data: staked } = useScaffoldReadContract({
    ...s,
    functionName: "balanceOf",
    args: [address],
  });
  const { data: totalStaked } = useScaffoldReadContract({ ...s, functionName: "totalSupply" });
  const { data: earned } = useScaffoldReadContract({
    ...s,
    functionName: "earned",
    args: [address],
  });
  const { data: rewardRate } = useScaffoldReadContract({ ...s, functionName: "rewardRate" });
  const { data: periodFinish } = useScaffoldReadContract({ ...s, functionName: "periodFinish" });

  const token = useScaffoldWriteContract({ contractName: "ARLToken" });
  const pool = useScaffoldWriteContract({ contractName: "ARLStakingRewards" });
  const busy = token.isMining || pool.isMining;
  const active = now !== undefined && periodFinish !== undefined && now < periodFinish;

  return (
    <div className="flex flex-col gap-6">
      <Facts>
        <Stat
          label="Your stake"
          value={<Arl value={staked} />}
          testId="staking-staked"
          hint={
            staked !== undefined && totalStaked
              ? `${percent(staked, totalStaked)}% of the pool`
              : undefined
          }
        />
        <Stat label="Rewards earned" value={<Arl value={earned} />} testId="staking-earned" />
        <Stat
          label="Your rate"
          value={
            <Arl
              value={
                rewardRate !== undefined &&
                staked !== undefined &&
                totalStaked !== undefined &&
                active
                  ? rewardPerDay(rewardRate, staked, totalStaked)
                  : active
                    ? undefined
                    : 0n
              }
            />
          }
          hint="Per day at the current rate"
        />
        <Stat label="Total staked" value={<Arl value={totalStaked} decimals={2} />} />
        <Stat
          label="Pool rewards per day"
          value={
            <Arl
              value={rewardRate !== undefined ? (active ? rewardRate * 86_400n : 0n) : undefined}
              decimals={2}
            />
          }
        />
        <Stat
          label="Period ends"
          value={
            periodFinish !== undefined
              ? periodFinish === 0n
                ? "Not started"
                : formatDate(periodFinish)
              : "…"
          }
          hint={now !== undefined && periodFinish ? timeLeft(now, periodFinish) : undefined}
        />
      </Facts>

      <section className="glass-strong flex flex-col gap-5 p-5">
        <AmountForm
          label="Stake"
          action="Stake"
          available={walletBalance}
          busy={busy}
          testId="stake"
          onSubmit={async (amount) => {
            if (!staking) return;
            // Approve exactly the amount being staked; no standing unlimited allowance.
            if (allowance === undefined || allowance < amount) {
              const approved = await token.writeContractAsync({
                functionName: "approve",
                args: [staking.address, amount],
              });
              if (!approved) return;
            }
            await pool.writeContractAsync({ functionName: "stake", args: [amount] });
          }}
        />
        <AmountForm
          label="Withdraw"
          action="Withdraw"
          available={staked}
          busy={busy}
          testId="withdraw"
          onSubmit={async (amount) => {
            await pool.writeContractAsync({ functionName: "withdraw", args: [amount] });
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="staking-claim"
            disabled={!earned || busy}
            onClick={() => void pool.writeContractAsync({ functionName: "getReward" })}
          >
            Claim rewards
          </button>
          <button
            type="button"
            className="btn btn-glass"
            data-testid="staking-exit"
            disabled={(!staked && !earned) || busy}
            onClick={() => void pool.writeContractAsync({ functionName: "exit" })}
          >
            Withdraw all and claim
          </button>
        </div>
      </section>
    </div>
  );
}
