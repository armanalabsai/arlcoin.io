"use client";

import { useState } from "react";
import { zeroAddress } from "viem";
import { useAccount, useBlockNumber, useReadContracts, useWriteContract } from "wagmi";

import { Arl, PageTitle, RequireWallet, Stat, useChainTime } from "~~/components/arl/ui";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useTransactor,
} from "~~/hooks/scaffold-eth";
import deployedContracts from "~~/contracts/deployedContracts";
import { formatDate, percent, timeLeft, vestingPhase } from "~~/lib/format";

const VESTING_ABI = deployedContracts[31337].ARLVestingWallet.abi;
const TOKEN_ABI = deployedContracts[31337].ARLToken.abi;

export default function VestingPage() {
  return (
    <>
      <PageTitle title="Vesting">
        Tokens held by a vesting wallet unlock linearly after the cliff. Anyone can trigger a
        release; released tokens always go to the beneficiary.
      </PageTitle>
      <RequireWallet>
        <Vesting />
      </RequireWallet>
    </>
  );
}

function Vesting() {
  const { address } = useAccount();
  const now = useChainTime();
  const { data: token } = useDeployedContractInfo({ contractName: "ARLToken" });
  const { data: wallet } = useDeployedContractInfo({ contractName: "ARLVestingWallet" });
  const read = { contractName: "ARLVestingWallet" } as const;
  const { data: beneficiary } = useScaffoldReadContract({ ...read, functionName: "owner" });
  const { data: cliffEnd } = useScaffoldReadContract({ ...read, functionName: "cliffEnd" });
  const { data: vestingEnd } = useScaffoldReadContract({ ...read, functionName: "vestingEnd" });
  // `released`, `releasable` and `release` are overloaded in VestingWallet (ETH and ERC-20
  // variants), which the Scaffold-ETH typed hooks cannot express, so they are called through wagmi
  // directly. The three amounts are read in one call at the same block, so that
  // total = held + released is always consistent.
  const vestingAddress = wallet?.address ?? zeroAddress;
  const tokenAddress = token?.address ?? zeroAddress;
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const { data: amounts, refetch } = useReadContracts({
    allowFailure: false,
    blockNumber,
    contracts: [
      { address: tokenAddress, abi: TOKEN_ABI, functionName: "balanceOf", args: [vestingAddress] },
      { address: vestingAddress, abi: VESTING_ABI, functionName: "released", args: [tokenAddress] },
      {
        address: vestingAddress,
        abi: VESTING_ABI,
        functionName: "releasable",
        args: [tokenAddress],
      },
    ],
    query: { enabled: !!wallet && !!token && blockNumber !== undefined },
  });
  const [held, released, releasable] = amounts ?? [];
  const { writeContractAsync } = useWriteContract();
  const transact = useTransactor();
  const [isMining, setIsMining] = useState(false);
  const release = async () => {
    if (!wallet || !token) return;
    setIsMining(true);
    try {
      await transact(() =>
        writeContractAsync({
          address: vestingAddress,
          abi: VESTING_ABI,
          functionName: "release",
          args: [tokenAddress],
        }),
      );
      await refetch();
    } finally {
      setIsMining(false);
    }
  };

  const total = held !== undefined && released !== undefined ? held + released : undefined;
  const phase =
    now !== undefined && cliffEnd !== undefined && vestingEnd !== undefined
      ? vestingPhase(now, cliffEnd, vestingEnd)
      : undefined;
  const isBeneficiary =
    !!address && !!beneficiary && beneficiary.toLowerCase() === address.toLowerCase();
  const unlocked =
    total !== undefined && held !== undefined && releasable !== undefined
      ? total - held + releasable
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="glass-strong p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs tracking-wide text-subtle uppercase">Beneficiary</div>
            <div className="font-mono text-sm break-all" data-testid="vesting-beneficiary">
              {beneficiary ?? "…"}
            </div>
          </div>
          <span
            className={`badge ${phase === "cliff" ? "badge-warning" : phase === "vesting" ? "badge-info" : "badge-success"}`}
            data-testid="vesting-phase"
          >
            {phase === "cliff"
              ? "In cliff"
              : phase === "vesting"
                ? "Vesting"
                : phase === "complete"
                  ? "Fully vested"
                  : "…"}
          </span>
        </div>
        {unlocked !== undefined && total !== undefined ? (
          <div className="mt-4">
            <progress
              className="progress progress-primary w-full"
              value={Number(percent(unlocked, total))}
              max={100}
            />
            <div className="mt-1 text-xs text-muted">{percent(unlocked, total)}% unlocked</div>
          </div>
        ) : null}
        {!isBeneficiary && beneficiary ? (
          <p className="mt-3 text-xs text-muted">
            The connected wallet is not the beneficiary. A release still pays the beneficiary.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Total in schedule"
          value={<Arl value={total} decimals={2} />}
          testId="vesting-total"
        />
        <Stat
          label="Released"
          value={<Arl value={released} decimals={2} />}
          testId="vesting-released"
        />
        <Stat
          label="Releasable now"
          value={<Arl value={releasable} />}
          testId="vesting-releasable"
        />
        <Stat
          label="Cliff ends"
          value={cliffEnd !== undefined ? formatDate(cliffEnd) : "…"}
          hint={now !== undefined && cliffEnd !== undefined ? timeLeft(now, cliffEnd) : undefined}
        />
        <Stat
          label="Fully vested"
          value={vestingEnd !== undefined ? formatDate(vestingEnd) : "…"}
          hint={
            now !== undefined && vestingEnd !== undefined ? timeLeft(now, vestingEnd) : undefined
          }
        />
      </div>

      <button
        type="button"
        className="btn btn-primary self-start"
        data-testid="vesting-release"
        disabled={!token || !releasable || isMining}
        onClick={() => void release()}
      >
        {isMining ? (
          <span className="loading loading-spinner loading-sm" />
        ) : (
          "Release to beneficiary"
        )}
      </button>
    </div>
  );
}
