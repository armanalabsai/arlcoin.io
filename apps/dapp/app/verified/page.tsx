"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { erc20Abi } from "viem";
import type { Address } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import {
  AmountForm,
  Arl,
  Facts,
  PageTitle,
  RequireWallet,
  Stat,
  useChainTime,
} from "~~/components/arl/ui";
import { ARL, IS_TESTNET, REFRESH_MS } from "~~/lib/contracts";
import {
  ARBITER_SAFE,
  EVALUATOR,
  EXPLORER,
  TIERS,
  evaluatorAbi,
  phaseName,
} from "~~/lib/evaluator";
import { formatDate, timeLeft } from "~~/lib/format";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const firstLine = (e: unknown, fallback: string) =>
  e instanceof Error ? (e.message.split("\n")[0] ?? fallback) : fallback;

export default function VerifiedPage() {
  return (
    <>
      <PageTitle title="Verified jobs">
        A staked validator committee decides whether an ERC-8183 job is paid. After the vote there
        is a challenge window; a 2-of-3 arbiter Safe rules on disputed jobs only and cannot receive
        escrow or slashed funds. Base Sepolia testnet only. The evaluator was added after the 17
        October 2026 internal security audit and is checked by its own tests, fuzzing, invariants
        and static analysis.
      </PageTitle>
      {IS_TESTNET ? (
        <RequireWallet>
          <Verified />
        </RequireWallet>
      ) : (
        <p className="glass-strong p-5 text-sm text-muted">
          The verified evaluator is deployed on Base Sepolia only.
        </p>
      )}
    </>
  );
}

function Verified() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const now = useChainTime();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [jobText, setJobText] = useState("");

  const me = useQuery({
    queryKey: ["evaluator-me", address],
    enabled: client !== undefined && address !== undefined,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      if (!client || !address) throw new Error("no wallet");
      const [staked, locked, balance, minBond, minWindow] = await Promise.all([
        client.readContract({
          address: EVALUATOR,
          abi: evaluatorAbi,
          functionName: "stakeOf",
          args: [address],
        }),
        client.readContract({
          address: EVALUATOR,
          abi: evaluatorAbi,
          functionName: "lockedOf",
          args: [address],
        }),
        client.readContract({
          address: ARL.ARLToken.address as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
        client.readContract({ address: EVALUATOR, abi: evaluatorAbi, functionName: "minBond" }),
        client.readContract({
          address: EVALUATOR,
          abi: evaluatorAbi,
          functionName: "minChallengeWindow",
        }),
      ]);
      return { staked, locked, balance, minBond, minWindow };
    },
  });

  const jobId = /^\d+$/.test(jobText.trim()) ? BigInt(jobText.trim()) : undefined;
  const job = useQuery({
    queryKey: ["evaluator-job", jobId?.toString()],
    enabled: client !== undefined && jobId !== undefined,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      if (!client || jobId === undefined) throw new Error("no job");
      const [config, verdict] = await Promise.all([
        client.readContract({
          address: EVALUATOR,
          abi: evaluatorAbi,
          functionName: "getConfig",
          args: [jobId],
        }),
        client.readContract({
          address: EVALUATOR,
          abi: evaluatorAbi,
          functionName: "getVerdict",
          args: [jobId],
        }),
      ]);
      return { config, verdict };
    },
  });

  async function send(label: string, run: () => Promise<unknown>) {
    setBusy(true);
    setMessage(`${label}: confirm in your wallet`);
    try {
      await run();
      setMessage(`${label}: sent`);
      await me.refetch();
      await job.refetch();
    } catch (e) {
      setMessage(firstLine(e, `${label} failed`));
    } finally {
      setBusy(false);
    }
  }

  const free = me.data ? me.data.staked - me.data.locked : undefined;
  const v = job.data?.verdict;
  const c = job.data?.config;
  const canFinalize =
    v !== undefined &&
    (v.phase === 2 || v.phase === 3) &&
    now !== undefined &&
    now >= v.challengeEnds;

  return (
    <div className="flex flex-col gap-6">
      <Facts>
        <Stat
          label="Evaluator"
          value={
            <a
              className="link"
              href={`${EXPLORER}/address/${EVALUATOR}`}
              target="_blank"
              rel="noreferrer"
            >
              {short(EVALUATOR)}
            </a>
          }
          hint="Source verified on Blockscout"
        />
        <Stat
          label="Arbiter Safe"
          value={
            <a
              className="link"
              href={`${EXPLORER}/address/${ARBITER_SAFE}`}
              target="_blank"
              rel="noreferrer"
            >
              {short(ARBITER_SAFE)}
            </a>
          }
          hint="Safe v1.5.0, 2-of-3, disputed jobs only"
        />
        <Stat label="Minimum bond" value={<Arl value={me.data?.minBond} />} />
        <Stat
          label="Minimum challenge window"
          value={me.data ? `${String(Number(me.data.minWindow) / 60)} min` : "reading"}
        />
      </Facts>

      <section className="glass-strong flex flex-col gap-5 p-5" aria-labelledby="validator-heading">
        <h2 id="validator-heading" className="text-sm font-extrabold">
          Your validator stake
        </h2>
        <Facts inset>
          <Stat label="Staked" value={<Arl value={me.data?.staked} />} testId="validator-staked" />
          <Stat label="Locked in jobs" value={<Arl value={me.data?.locked} />} />
        </Facts>
        <AmountForm
          label="Stake as a validator"
          action="Stake"
          available={me.data?.balance}
          busy={busy}
          testId="validator-stake"
          onSubmit={(amount) =>
            send("Stake", async () => {
              // Approve exactly the amount being staked; no standing unlimited allowance.
              await writeContractAsync({
                address: ARL.ARLToken.address as Address,
                abi: erc20Abi,
                functionName: "approve",
                args: [EVALUATOR, amount],
              });
              await writeContractAsync({
                address: EVALUATOR,
                abi: evaluatorAbi,
                functionName: "stake",
                args: [amount],
              });
            })
          }
        />
        <AmountForm
          label="Unstake (unlocked stake only)"
          action="Unstake"
          available={free}
          busy={busy}
          testId="validator-unstake"
          onSubmit={(amount) =>
            send("Unstake", () =>
              writeContractAsync({
                address: EVALUATOR,
                abi: evaluatorAbi,
                functionName: "unstake",
                args: [amount],
              }),
            )
          }
        />
      </section>

      <section className="glass-strong flex flex-col gap-4 p-5" aria-labelledby="verdict-heading">
        <h2 id="verdict-heading" className="text-sm font-extrabold">
          Look up a job&apos;s verdict
        </h2>
        <input
          className="input glass-field w-full"
          inputMode="numeric"
          placeholder="Job number, for example 1"
          value={jobText}
          onChange={(e) => setJobText(e.target.value)}
          data-testid="verdict-job"
          aria-label="Job number"
        />
        {job.isError ? <p className="text-sm text-error">Could not read this job.</p> : null}
        {v && c ? (
          <>
            <Facts inset>
              <Stat label="Verdict" value={phaseName(v.phase)} testId="verdict-phase" />
              <Stat
                label="Votes"
                value={`${String(v.approvals)} approve · ${String(v.rejections)} reject`}
              />
              <Stat
                label="Threshold"
                value={`${String(c.threshold)} of ${String(c.committee.length)}`}
              />
              <Stat label="Tier" value={TIERS[c.tier] ?? String(c.tier)} />
              {v.challengeEnds > 0n ? (
                <Stat
                  label="Challenge window ends"
                  value={formatDate(v.challengeEnds)}
                  hint={
                    now !== undefined && now < v.challengeEnds
                      ? timeLeft(now, v.challengeEnds)
                      : "closed"
                  }
                />
              ) : null}
              <Stat label="Committee" value={c.committee.map(short).join(", ") || "none"} />
            </Facts>
            <button
              type="button"
              className="btn btn-primary self-start"
              disabled={!canFinalize || busy}
              data-testid="verdict-finalize"
              onClick={() =>
                jobId !== undefined &&
                void send("Finalize", () =>
                  writeContractAsync({
                    address: EVALUATOR,
                    abi: evaluatorAbi,
                    functionName: "finalize",
                    args: [jobId],
                  }),
                )
              }
            >
              Finalize and pay out
            </button>
          </>
        ) : null}
      </section>

      {message ? (
        <p className="text-sm text-muted" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
