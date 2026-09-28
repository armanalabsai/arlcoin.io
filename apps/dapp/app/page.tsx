"use client";

import Link from "next/link";
import { useState } from "react";
import { isAddress } from "viem";
import type { Address } from "viem";
import { useAccount } from "wagmi";

import { AmountForm, Arl, PageTitle, RequireWallet, Stat } from "~~/components/arl/ui";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

export default function WalletPage() {
  return (
    <>
      <PageTitle title="Wallet">Your ARL balance, and sending ARL.</PageTitle>
      <RequireWallet>
        <Wallet />
      </RequireWallet>
    </>
  );
}

function Wallet() {
  const { address } = useAccount();
  const { data: balance } = useScaffoldReadContract({
    contractName: "ARLToken",
    functionName: "balanceOf",
    args: [address],
  });
  const { data: supply } = useScaffoldReadContract({
    contractName: "ARLToken",
    functionName: "totalSupply",
  });
  const { data: staked } = useScaffoldReadContract({
    contractName: "ARLStakingRewards",
    functionName: "balanceOf",
    args: [address],
  });
  const { data: earned } = useScaffoldReadContract({
    contractName: "ARLStakingRewards",
    functionName: "earned",
    args: [address],
  });
  const { data: beneficiary } = useScaffoldReadContract({
    contractName: "ARLVestingWallet",
    functionName: "owner",
  });
  const isBeneficiary =
    !!address && !!beneficiary && beneficiary.toLowerCase() === address.toLowerCase();

  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "ARLToken" });
  const [to, setTo] = useState("");
  const toValid = isAddress(to);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Balance" value={<Arl value={balance} />} testId="wallet-balance" />
        <Stat
          label="Staked"
          value={<Arl value={staked} />}
          hint={
            <Link className="link" href="/staking">
              Staking
            </Link>
          }
        />
        <Stat
          label="Staking rewards"
          value={<Arl value={earned} />}
          hint="Earned, not yet claimed"
        />
      </div>
      {isBeneficiary ? (
        <div className="glass-chip border-primary/40! px-4 py-3 text-sm">
          You are the beneficiary of a vesting wallet.{" "}
          <Link className="link" href="/vesting">
            View vesting
          </Link>
        </div>
      ) : null}

      <section className="glass-strong flex flex-col gap-3 p-5">
        <h2 className="font-semibold">Send ARL</h2>
        <label className="text-sm text-muted" htmlFor="send-to">
          Recipient address
        </label>
        <input
          id="send-to"
          data-testid="send-to"
          className="input glass-field w-full font-mono text-sm"
          placeholder="0x…"
          value={to}
          onChange={(e) => setTo(e.target.value.trim())}
          aria-invalid={to !== "" && !toValid}
        />
        {to !== "" && !toValid ? <p className="text-xs text-error">Not a valid address</p> : null}
        <AmountForm
          label="Amount"
          action="Send"
          available={balance}
          busy={isMining}
          testId="send"
          onSubmit={async (amount) => {
            if (!toValid) return;
            await writeContractAsync({ functionName: "transfer", args: [to as Address, amount] });
          }}
        />
      </section>

      <p className="text-xs text-subtle">
        Total supply: <Arl value={supply} decimals={0} /> (fixed; no mint function exists).
      </p>
    </div>
  );
}
