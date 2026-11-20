"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { erc20Abi, formatUnits, parseEventLogs, parseUnits } from "viem";
import type { Address, Hex } from "viem";
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
import { ARL, IS_MAINNET, REFRESH_MS } from "~~/lib/contracts";
import {
  ARBITER_SAFE,
  EVALUATOR,
  EXPLORER,
  TIERS,
  EVALUATOR_DEPLOY_BLOCK,
  RETIRED_EVALUATOR,
  countStats,
  evaluatorAbi,
  evaluatorEvents,
  phaseName,
} from "~~/lib/evaluator";
import { formatDate, timeLeft } from "~~/lib/format";
import { eventsSince } from "~~/lib/logs";
import {
  OPERATOR_VALIDATORS,
  REEXECUTION,
  checkOpen,
  deliverableOf,
  specHashOf,
} from "~~/lib/verifiedJob";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const firstLine = (e: unknown, fallback: string) =>
  e instanceof Error ? (e.message.split("\n")[0] ?? fallback) : fallback;

export default function VerifiedPage() {
  return (
    <>
      <PageTitle title="Verified jobs">
        A staked validator committee decides whether an ERC-8183 job is paid. After the vote there
        is a challenge window; a 2-of-3 arbiter Safe rules on disputed jobs only and cannot receive
        escrow or slashed funds. Live on Base Mainnet with the ARL escrow. The evaluator was added
        after the 17 October 2026 internal security audit and is checked by its own tests, fuzzing,
        invariants and static analysis.
      </PageTitle>
      {IS_MAINNET ? <NetworkStats /> : null}
      {IS_MAINNET ? (
        <RequireWallet>
          <Verified />
        </RequireWallet>
      ) : (
        <p className="glass-strong p-5 text-sm text-muted">
          The verified evaluator runs on Base Mainnet; this build targets another chain.
        </p>
      )}
    </>
  );
}

/** Public activity of the evaluator, counted from its events since deployment. */
function NetworkStats() {
  const client = usePublicClient();
  const stats = useQuery({
    queryKey: ["evaluator-stats"],
    enabled: client !== undefined,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!client) throw new Error("no client");
      const logs = await eventsSince(client, EVALUATOR_DEPLOY_BLOCK, (range) =>
        client.getContractEvents({ address: EVALUATOR, abi: evaluatorEvents, ...range }),
      );
      return countStats(logs as Parameters<typeof countStats>[0]);
    },
  });
  const s = stats.data;
  const n = (v: number | undefined) => (v === undefined ? "reading" : String(v));
  return (
    <section className="mb-6" aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="mb-2 text-sm font-extrabold">
        Network activity
      </h2>
      <Facts>
        <Stat label="Jobs configured" value={n(s?.jobs)} testId="stats-jobs" />
        <Stat
          label="Finalized"
          value={s ? `${String(s.approved)} approved · ${String(s.rejected)} rejected` : "reading"}
        />
        <Stat label="Active validators" value={n(s?.validators)} />
        <Stat label="ARL staked" value={<Arl value={s?.staked} />} />
        <Stat label="Disputes" value={n(s?.disputes)} />
        <Stat label="ARL slashed" value={<Arl value={s?.slashed} />} />
      </Facts>
      {stats.isError ? (
        <p className="mt-2 text-xs text-subtle">The public RPC did not answer; retrying.</p>
      ) : null}
    </section>
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

      <RetiredStake />

      <OpenVerifiedJob minBond={me.data?.minBond} minWindow={me.data?.minWindow} />

      <ProviderSteps />

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

const JOBS = ARL.ARLJobs;
const TOKEN = ARL.ARLToken;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Where the browser fetches a spec from: https as is, ipfs through a public gateway. */
const fetchable = (url: string) =>
  url.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${url.slice("ipfs://".length)}` : url;

/**
 * The client's side of a verified job, in one flow: post the job with the spec link as its
 * description, name the committee and the spec hash, propose the budget and escrow it. Every
 * check `configure` and the reference validators make runs first, so nothing is sent for a job
 * that would revert or that no validator would accept.
 */
function OpenVerifiedJob({ minBond, minWindow }: { minBond?: bigint; minWindow?: bigint }) {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [specUrl, setSpecUrl] = useState("");
  const [provider, setProvider] = useState("");
  const [budget, setBudget] = useState("100");
  const [bond, setBond] = useState("");
  const [committee, setCommittee] = useState(OPERATOR_VALIDATORS.join("\n"));
  const [threshold, setThreshold] = useState("2");
  const [voteHours, setVoteHours] = useState("2");
  const [challengeHours, setChallengeHours] = useState("");
  const [deadlineHours, setDeadlineHours] = useState("72");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const toUnits = (text: string, fallback?: bigint) => {
    if (text.trim() === "") return fallback ?? -1n;
    try {
      return parseUnits(text.trim(), 18);
    } catch {
      return -1n;
    }
  };
  const toSeconds = (text: string, fallback?: bigint) => {
    if (text.trim() === "") return fallback ?? -1n;
    const n = Number(text.trim());
    return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 3600)) : -1n;
  };

  const open = async () => {
    if (!client || !address || minBond === undefined || minWindow === undefined) return;
    const checked = checkOpen({
      client: address,
      arbiter: ARBITER_SAFE,
      specUrl,
      provider,
      committee,
      threshold: Number(threshold),
      budget: toUnits(budget),
      bond: toUnits(bond, minBond),
      minBond,
      voteWindow: toSeconds(voteHours),
      challengeWindow: toSeconds(challengeHours, minWindow),
      minChallengeWindow: minWindow,
      deadlineSeconds: toSeconds(deadlineHours),
    });
    if (!checked.ok) return setNote(checked.error);
    const p = checked.plan;
    setBusy(true);
    try {
      setNote("Reading the spec");
      const response = await fetch(fetchable(p.specUrl));
      if (!response.ok) throw new Error(`The spec link answered ${String(response.status)}`);
      const specHash = specHashOf(await response.text());

      setNote("Posting the job (1 of 5)");
      const block = await client.getBlock();
      const created = await writeContractAsync({
        address: JOBS.address,
        abi: JOBS.abi,
        functionName: "createJob",
        args: [p.provider, EVALUATOR, block.timestamp + p.deadlineSeconds, p.specUrl, ZERO_ADDRESS],
      });
      const receipt = await client.waitForTransactionReceipt({ hash: created });
      const [event] = parseEventLogs({
        abi: JOBS.abi,
        eventName: "JobCreated",
        logs: receipt.logs,
      });
      if (!event) throw new Error("The job was not created");
      const id = event.args.jobId;

      setNote(`Job ${String(id)}: naming the committee (2 of 5)`);
      const configured = await writeContractAsync({
        address: EVALUATOR,
        abi: evaluatorAbi,
        functionName: "configure",
        args: [
          id,
          {
            tier: REEXECUTION,
            threshold: p.threshold,
            voteWindow: p.voteWindow,
            challengeWindow: p.challengeWindow,
            bond: p.bond,
            providerAgentId: 0n,
            specHash,
            committee: p.committee,
          },
        ],
      });
      await client.waitForTransactionReceipt({ hash: configured });

      setNote(`Job ${String(id)}: proposing the budget (3 of 5)`);
      const priced = await writeContractAsync({
        address: JOBS.address,
        abi: JOBS.abi,
        functionName: "setBudget",
        args: [id, p.budget, "0x"],
      });
      await client.waitForTransactionReceipt({ hash: priced });

      setNote(`Job ${String(id)}: approving exactly the budget (4 of 5)`);
      const approved = await writeContractAsync({
        address: TOKEN.address,
        abi: TOKEN.abi,
        functionName: "approve",
        args: [JOBS.address, p.budget],
      });
      await client.waitForTransactionReceipt({ hash: approved });

      setNote(`Job ${String(id)}: escrowing the budget (5 of 5)`);
      const funded = await writeContractAsync({
        address: JOBS.address,
        abi: JOBS.abi,
        functionName: "fund",
        args: [id, p.budget, "0x"],
      });
      await client.waitForTransactionReceipt({ hash: funded });
      setNote(
        `Job ${String(id)} is open and funded. Next, the provider approves the committee, then each member accepts.`,
      );
    } catch (e) {
      setNote(firstLine(e, "Could not open the job"));
    } finally {
      setBusy(false);
    }
  };

  const field = "input glass-field w-full";
  return (
    <section className="glass-strong flex flex-col gap-3 p-5" aria-labelledby="open-heading">
      <h2 id="open-heading" className="text-sm font-extrabold">
        Open a verified job (client)
      </h2>
      <p className="text-sm text-muted">
        The job description is the link to an <code>arl-reexec/1</code> spec; its hash is recorded
        on chain, and the committee re-runs it and compares the result with what the provider
        delivers. Five confirmations: post, name the committee, propose the budget, approve, escrow.
      </p>
      <label className="text-sm text-muted" htmlFor="open-spec">
        Spec link (https:// or ipfs://)
      </label>
      <input
        id="open-spec"
        className={field}
        value={specUrl}
        onChange={(e) => setSpecUrl(e.target.value)}
        placeholder="https://…/spec.json"
        data-testid="open-spec"
      />
      <label className="text-sm text-muted" htmlFor="open-provider">
        Provider address
      </label>
      <input
        id="open-provider"
        className={field}
        value={provider}
        onChange={(e) => setProvider(e.target.value)}
        placeholder="0x…"
        data-testid="open-provider"
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Budget (ARL)
          <input
            className={field}
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            data-testid="open-budget"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Bond per member (ARL)
          <input
            className={field}
            inputMode="decimal"
            value={bond}
            onChange={(e) => setBond(e.target.value)}
            placeholder={minBond === undefined ? "reading" : formatUnits(minBond, 18)}
            data-testid="open-bond"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Vote window (hours)
          <input
            className={field}
            inputMode="decimal"
            value={voteHours}
            onChange={(e) => setVoteHours(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Challenge window (hours)
          <input
            className={field}
            inputMode="decimal"
            value={challengeHours}
            onChange={(e) => setChallengeHours(e.target.value)}
            placeholder={minWindow === undefined ? "reading" : String(Number(minWindow) / 3600)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Deadline (hours from now)
          <input
            className={field}
            inputMode="decimal"
            value={deadlineHours}
            onChange={(e) => setDeadlineHours(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Approvals needed
          <input
            className={field}
            inputMode="numeric"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </label>
      </div>
      <label className="text-sm text-muted" htmlFor="open-committee">
        Committee (one address per line; the ARL operator&apos;s validators by default)
      </label>
      <textarea
        id="open-committee"
        className="textarea glass-field w-full font-mono text-xs"
        rows={3}
        value={committee}
        onChange={(e) => setCommittee(e.target.value)}
        data-testid="open-committee"
      />
      <div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || minBond === undefined}
          onClick={() => void open()}
          data-testid="open-submit"
        >
          Open and fund the job
        </button>
      </div>
      {note ? (
        <p className="text-sm text-muted" role="status" data-testid="open-note">
          {note}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The provider's side: approve the committee the client named (no member can accept before),
 * then submit the re-execution result. The deliverable is the hash of the result's canonical
 * JSON, the value the validators recompute.
 */
function ProviderSteps() {
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [jobText, setJobText] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const id = /^\d+$/.test(jobText.trim()) ? BigInt(jobText.trim()) : undefined;

  const run = async (label: string, send: () => Promise<Hex>) => {
    setBusy(true);
    setNote(`${label}: confirm in your wallet`);
    try {
      const hash = await send();
      await client?.waitForTransactionReceipt({ hash });
      setNote(`${label}: done`);
    } catch (e) {
      setNote(firstLine(e, `${label} failed`));
    } finally {
      setBusy(false);
    }
  };

  let deliverable: Hex | null = null;
  let resultError = "";
  if (result.trim() !== "") {
    try {
      deliverable = deliverableOf(result);
    } catch (e) {
      resultError = firstLine(e, "Not a result document");
    }
  }

  return (
    <section className="glass-strong flex flex-col gap-3 p-5" aria-labelledby="provider-heading">
      <h2 id="provider-heading" className="text-sm font-extrabold">
        Deliver a verified job (provider)
      </h2>
      <input
        className="input glass-field w-full"
        inputMode="numeric"
        placeholder="Job number"
        value={jobText}
        onChange={(e) => setJobText(e.target.value)}
        aria-label="Job number"
        data-testid="provider-job"
      />
      <div>
        <button
          type="button"
          className="btn btn-glass"
          disabled={busy || id === undefined}
          data-testid="provider-approve"
          onClick={() =>
            id !== undefined &&
            void run("Approve the committee", () =>
              writeContractAsync({
                address: EVALUATOR,
                abi: evaluatorAbi,
                functionName: "approveCommittee",
                args: [id],
              }),
            )
          }
        >
          Approve the committee
        </button>
      </div>
      <label className="text-sm text-muted" htmlFor="provider-result">
        Result (<code>arl-reexec-result/1</code> JSON from <code>arl-verifier run</code>)
      </label>
      <textarea
        id="provider-result"
        className="textarea glass-field w-full font-mono text-xs"
        rows={4}
        value={result}
        onChange={(e) => setResult(e.target.value)}
        data-testid="provider-result"
      />
      {deliverable ? (
        <p className="break-all text-xs text-subtle">Deliverable: {deliverable}</p>
      ) : resultError ? (
        <p className="text-xs text-error">{resultError}</p>
      ) : null}
      <div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || id === undefined || deliverable === null}
          data-testid="provider-submit"
          onClick={() =>
            id !== undefined &&
            deliverable !== null &&
            void run("Submit the result", () =>
              writeContractAsync({
                address: JOBS.address,
                abi: JOBS.abi,
                functionName: "submit",
                args: [id, deliverable, "0x"],
              }),
            )
          }
        >
          Submit the result
        </button>
      </div>
      {note ? (
        <p className="text-sm text-muted" role="status">
          {note}
        </p>
      ) : null}
    </section>
  );
}

/** Shown only to a wallet that still has stake on the retired v5 evaluator: one tap withdraws it. */
function RetiredStake() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const old = useQuery({
    queryKey: ["evaluator-retired", address],
    enabled: client !== undefined && address !== undefined && IS_MAINNET,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      if (!client || !address) throw new Error("no wallet");
      const [staked, locked] = await Promise.all([
        client.readContract({
          address: RETIRED_EVALUATOR,
          abi: evaluatorAbi,
          functionName: "stakeOf",
          args: [address],
        }),
        client.readContract({
          address: RETIRED_EVALUATOR,
          abi: evaluatorAbi,
          functionName: "lockedOf",
          args: [address],
        }),
      ]);
      return staked - locked;
    },
  });
  const free = old.data;
  if (!free) return null;
  return (
    <section className="glass-strong flex flex-col gap-3 p-5" data-testid="retired-stake">
      <h2 className="text-sm font-extrabold">Stake on the earlier evaluator</h2>
      <p className="text-sm text-muted">
        You have <Arl value={free} /> on the evaluator that was replaced on 19 November 2026.
        Withdraw it, then stake above on the current one.
      </p>
      <div>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="retired-withdraw"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setNote("");
            void (async () => {
              try {
                const hash = await writeContractAsync({
                  address: RETIRED_EVALUATOR,
                  abi: evaluatorAbi,
                  functionName: "unstake",
                  args: [free],
                });
                await client?.waitForTransactionReceipt({ hash });
                await old.refetch();
                setNote("Withdrawn.");
              } catch (e) {
                setNote(e instanceof Error ? (e.message.split("\n")[0] ?? e.message) : String(e));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Withdraw from the earlier evaluator
        </button>
      </div>
      {note ? (
        <p className="text-sm text-muted" role="status">
          {note}
        </p>
      ) : null}
    </section>
  );
}
