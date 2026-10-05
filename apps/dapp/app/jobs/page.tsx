"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  createWalletClient,
  getAddress,
  http,
  isAddress,
  isAddressEqual,
  parseEventLogs,
} from "viem";
import type { Address, Hex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { Arl, Facts, PageTitle, RequireWallet, Stat, useChainTime } from "~~/components/arl/ui";
import deployedContracts from "~~/contracts/deployedContracts";
import { useArlServices } from "~~/hooks/arl/useArlServices";
import type { ListedService } from "~~/hooks/arl/useArlServices";
import { useJobRatings } from "~~/hooks/arl/useJobRatings";
import type { ServiceRatings } from "~~/hooks/arl/useJobRatings";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { formatDate, timeLeft } from "~~/lib/format";
import {
  actions,
  deliverableHash,
  isAnvilAccount,
  rolesOf,
  statusName,
  validateJob,
} from "~~/lib/jobs";
import type { Job, Role } from "~~/lib/jobs";
import { LOCAL_CHAIN_ID } from "~~/lib/network";
import {
  JOB_TAG,
  RATING_TAG,
  REPUTATION_REGISTRY,
  STARS,
  encodeJobFeedback,
  reputationRegistryAbi,
  starsToValue,
} from "~~/lib/reputation";

const JOBS = deployedContracts[31337].ARLJobs;
const TOKEN = deployedContracts[31337].ARLToken;

type Status =
  | { kind: "idle" }
  | { kind: "busy"; text: string }
  | { kind: "done"; text: string }
  | { kind: "error"; text: string };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ZERO32: Hex = `0x${"0".repeat(64)}`;
const firstLine = (e: unknown, fallback: string) =>
  e instanceof Error ? (e.message.split("\n")[0] ?? fallback) : fallback;

export default function JobsPage() {
  return (
    <>
      <PageTitle title="Jobs">
        Hire a service for a piece of work and pay in ARL through escrow. The budget is held by the
        contract until the evaluator you choose accepts the result (the provider is paid) or rejects
        it (you are refunded). If nobody acts before the deadline, anyone can return the budget to
        you.
      </PageTitle>
      <RequireWallet>
        <Jobs />
      </RequireWallet>
    </>
  );
}

/** Every job the account takes part in, with the delivered result references. */
function useJobs(account: Address | undefined) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["arl-jobs", client?.chain.id, account],
    enabled: !!client && !!account,
    refetchInterval: 3_000,
    queryFn: async (): Promise<Job[]> => {
      if (!client || !account) return [];
      const [created, submitted, fundedLogs] = await Promise.all([
        client.getContractEvents({
          address: JOBS.address,
          abi: JOBS.abi,
          eventName: "JobCreated",
          fromBlock: 0n,
        }),
        client.getContractEvents({
          address: JOBS.address,
          abi: JOBS.abi,
          eventName: "JobSubmitted",
          fromBlock: 0n,
        }),
        client.getContractEvents({
          address: JOBS.address,
          abi: JOBS.abi,
          eventName: "JobFunded",
          fromBlock: 0n,
        }),
      ]);
      const funded = new Set(
        fundedLogs.flatMap((l) => (l.args.jobId === undefined ? [] : [l.args.jobId])),
      );
      const delivered = new Map<bigint, Hex>();
      for (const s of submitted)
        if (s.args.jobId !== undefined && s.args.deliverable)
          delivered.set(s.args.jobId, s.args.deliverable);
      const ids = created.flatMap((c) => (c.args.jobId === undefined ? [] : [c.args.jobId]));
      const jobs = await Promise.all(
        ids.map(async (id) => {
          const j = await client.readContract({
            address: JOBS.address,
            abi: JOBS.abi,
            functionName: "getJob",
            args: [id],
          });
          return {
            id,
            client: j.client,
            provider: j.provider,
            evaluator: j.evaluator,
            description: j.description,
            budget: j.budget,
            expiredAt: j.expiredAt,
            status: statusName(j.status),
            deliverable: delivered.get(id),
            funded: funded.has(id),
          } satisfies Job;
        }),
      );
      // Newest first; only jobs this account is part of.
      return jobs.filter((j) => rolesOf(j, account).length > 0).reverse();
    },
  });
}

function Jobs() {
  const { address } = useAccount();
  const now = useChainTime();
  const { data: jobs, refetch } = useJobs(address);
  const { data: services } = useArlServices();
  const { data: ratings, refetch: refetchRatings } = useJobRatings(services);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  return (
    <div className="flex flex-col gap-6">
      <PostJob onStatus={setStatus} onPosted={() => void refetch()} busy={status.kind === "busy"} />
      <section className="flex flex-col gap-3" aria-labelledby="jobs-heading">
        <h2 id="jobs-heading" className="text-sm font-extrabold">
          Your jobs
        </h2>
        {jobs === undefined ? (
          <p className="text-sm text-muted">Reading jobs</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted" data-testid="jobs-empty">
            No jobs yet.
          </p>
        ) : (
          jobs.map((job) => (
            <JobCard
              key={String(job.id)}
              job={job}
              now={now}
              busy={status.kind === "busy"}
              onStatus={setStatus}
              onChanged={() => void refetch()}
              rate={
                <RateProvider
                  job={job}
                  services={services ?? []}
                  ratings={ratings}
                  busy={status.kind === "busy"}
                  onStatus={setStatus}
                  onRated={() => void refetchRatings()}
                />
              }
            />
          ))
        )}
      </section>
      {status.kind !== "idle" ? (
        <p
          className={`glass-chip px-4 py-3 text-sm ${status.kind === "error" ? "text-error" : ""}`}
          role="status"
          data-testid="jobs-status"
        >
          {status.kind === "busy" ? (
            <span className="loading loading-spinner loading-xs mr-2" />
          ) : null}
          {status.text}
        </p>
      ) : null}
    </div>
  );
}

function PostJob({
  onStatus,
  onPosted,
  busy,
}: {
  onStatus: (s: Status) => void;
  onPosted: () => void;
  busy: boolean;
}) {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: services } = useArlServices();
  const [provider, setProvider] = useState("");
  const [otherProvider, setOtherProvider] = useState("");
  const [evaluator, setEvaluator] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [hours, setHours] = useState("24");
  const [error, setError] = useState<string>();

  const post = async () => {
    setError(undefined);
    const input = validateJob({ description, budget, hours });
    if (!input.ok) return setError(input.error);
    const providerText = provider === "other" ? otherProvider.trim() : provider;
    if (!isAddress(providerText)) return setError("Choose a service or enter a provider address");
    const evaluatorText = evaluator.trim() === "" ? address : evaluator.trim();
    if (!evaluatorText || !isAddress(evaluatorText))
      return setError("The evaluator is not an address");
    if (!client) return;
    try {
      onStatus({ kind: "busy", text: "Posting the job" });
      const block = await client.getBlock();
      const created = await writeContractAsync({
        address: JOBS.address,
        abi: JOBS.abi,
        functionName: "createJob",
        args: [
          getAddress(providerText),
          getAddress(evaluatorText),
          block.timestamp + input.value.seconds,
          input.value.description,
          "0x0000000000000000000000000000000000000000",
        ],
      });
      const receipt = await client.waitForTransactionReceipt({ hash: created });
      const [event] = parseEventLogs({
        abi: JOBS.abi,
        eventName: "JobCreated",
        logs: receipt.logs,
      });
      if (!event) throw new Error("The job was not created");
      const id = event.args.jobId;
      onStatus({ kind: "busy", text: "Proposing the budget" });
      const priced = await writeContractAsync({
        address: JOBS.address,
        abi: JOBS.abi,
        functionName: "setBudget",
        args: [id, input.value.budget, "0x"],
      });
      await client.waitForTransactionReceipt({ hash: priced });
      setDescription("");
      setBudget("");
      onPosted();
      onStatus({ kind: "done", text: `Job ${String(id)} posted. Fund it to start the work.` });
    } catch (e) {
      onStatus({ kind: "error", text: firstLine(e, "Could not post the job") });
    }
  };

  return (
    <section className="glass-strong flex flex-col gap-4 p-5" aria-labelledby="post-heading">
      <h2 id="post-heading" className="text-sm font-extrabold">
        Post a job
      </h2>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Provider</span>
        <select
          className="select select-bordered w-full"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          data-testid="job-provider"
        >
          <option value="">Choose a service</option>
          {(services ?? []).map((s) => (
            <option key={String(s.agentId)} value={s.terms.payTo}>
              {s.name} ({short(s.terms.payTo)})
            </option>
          ))}
          <option value="other">Another address</option>
        </select>
      </label>
      {provider === "other" ? (
        <input
          className="input input-bordered w-full font-mono text-sm"
          placeholder="0x… provider address"
          value={otherProvider}
          onChange={(e) => setOtherProvider(e.target.value)}
          aria-label="Provider address"
        />
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">What should be done</span>
        <textarea
          className="textarea textarea-bordered w-full"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          data-testid="job-description"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Budget (ARL)</span>
          <input
            className="input input-bordered w-full"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            data-testid="job-budget"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Deadline (hours from now)</span>
          <input
            className="input input-bordered w-full"
            inputMode="numeric"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            data-testid="job-hours"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Evaluator (empty: you)</span>
        <input
          className="input input-bordered w-full font-mono text-sm"
          placeholder={address}
          value={evaluator}
          onChange={(e) => setEvaluator(e.target.value)}
          data-testid="job-evaluator"
        />
      </label>
      {error ? (
        <p className="text-sm text-error" data-testid="job-error">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-primary self-start"
        disabled={busy}
        onClick={() => void post()}
        data-testid="job-post"
      >
        Post job
      </button>
    </section>
  );
}

function JobCard({
  job,
  now,
  busy,
  onStatus,
  onChanged,
  rate,
}: {
  job: Job;
  now: bigint | undefined;
  busy: boolean;
  onStatus: (s: Status) => void;
  onChanged: () => void;
  rate: ReactNode;
}) {
  const { address } = useAccount();
  const client = usePublicClient();
  const { targetNetwork } = useTargetNetwork();
  const { writeContractAsync } = useWriteContract();
  const [result, setResult] = useState("");
  const id = String(job.id);
  const t = now ?? 0n;
  const mine = rolesOf(job, address);
  const local = targetNetwork.id === LOCAL_CHAIN_ID;

  // On the local chain, a provider or evaluator that is an Anvil development account (unlocked
  // by the node; no key in the app) can be played from here, so the whole flow can be tried.
  const played: { role: Role; account: Address }[] = local
    ? (
        [
          ["provider", job.provider],
          ["evaluator", job.evaluator],
        ] as const
      )
        .filter(([role, account]) => !mine.includes(role) && isAnvilAccount(account))
        .map(([role, account]) => ({ role, account }))
    : [];

  const run = async (text: string, done: string, send: () => Promise<Hex>) => {
    if (!client) return;
    try {
      onStatus({ kind: "busy", text });
      await client.waitForTransactionReceipt({ hash: await send() });
      onChanged();
      onStatus({ kind: "done", text: done });
    } catch (e) {
      onStatus({ kind: "error", text: firstLine(e, "The transaction failed") });
    }
  };

  /** Sends a job call from the connected wallet, or from a played local dev account. */
  const send = (
    account: Address | undefined,
    functionName: "submit" | "complete" | "reject",
    args: readonly [bigint, Hex, Hex],
  ): Promise<Hex> => {
    const request = { address: JOBS.address, abi: JOBS.abi, functionName, args } as const;
    if (!account) return writeContractAsync(request);
    return createWalletClient({
      account,
      chain: targetNetwork,
      transport: http(targetNetwork.rpcUrls.default.http[0]),
    }).writeContract(request);
  };

  const fund = async () => {
    if (!client || !address) return;
    try {
      onStatus({ kind: "busy", text: "Approving exactly the budget" });
      // Approve the budget only; no standing allowance for the escrow.
      const approved = await writeContractAsync({
        address: TOKEN.address,
        abi: TOKEN.abi,
        functionName: "approve",
        args: [JOBS.address, job.budget],
      });
      await client.waitForTransactionReceipt({ hash: approved });
      onStatus({ kind: "busy", text: "Escrowing the budget" });
      const funded = await writeContractAsync({
        address: JOBS.address,
        abi: JOBS.abi,
        functionName: "fund",
        args: [job.id, job.budget, "0x"],
      });
      await client.waitForTransactionReceipt({ hash: funded });
      onChanged();
      onStatus({ kind: "done", text: `Job ${id} is funded. The budget is in escrow.` });
    } catch (e) {
      onStatus({ kind: "error", text: firstLine(e, "Could not fund the job") });
    }
  };

  // What the connected wallet can do, then what the played accounts can do. Anyone can return an
  // expired budget, so that button appears once.
  const todo = [
    ...mine.map((role) => ({ role, account: undefined as Address | undefined })),
    ...played,
  ].flatMap(({ role, account }) =>
    actions(job, role, t).map((action) => ({ role, account, action })),
  );
  const buttons = todo
    .filter(
      (b, i) =>
        b.action !== "claimRefund" || todo.findIndex((o) => o.action === "claimRefund") === i,
    )
    .map(({ role, account, action }) => {
      const label = account ? ` as ${role} (local dev account ${short(account)})` : "";
      const key = `${role}-${action}`;
      switch (action) {
        case "fund":
          return (
            <button
              key={key}
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void fund()}
              data-testid={`job-${id}-fund`}
            >
              Fund <Arl value={job.budget} />
            </button>
          );
        case "submit":
          return (
            <div key={key} className="flex w-full flex-col gap-2">
              <input
                className="input input-bordered input-sm"
                placeholder="The result, or a link to it"
                value={result}
                onChange={(e) => setResult(e.target.value)}
                data-testid={`job-${id}-result`}
              />
              <button
                type="button"
                className="btn btn-glass btn-sm self-start"
                disabled={busy || result.trim() === ""}
                onClick={() =>
                  void run("Submitting the result", `Job ${id}: result submitted.`, () =>
                    send(account, "submit", [job.id, deliverableHash(result.trim()), "0x"]),
                  )
                }
                data-testid={`job-${id}-submit`}
              >
                Submit result{label}
              </button>
            </div>
          );
        case "complete":
          return (
            <button
              key={key}
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() =>
                void run("Accepting the result", `Job ${id} completed. The provider is paid.`, () =>
                  send(account, "complete", [job.id, ZERO32, "0x"]),
                )
              }
              data-testid={`job-${id}-complete`}
            >
              Accept and pay{label}
            </button>
          );
        case "reject":
          return (
            <button
              key={key}
              type="button"
              className="btn btn-glass btn-sm"
              disabled={busy}
              onClick={() =>
                void run(
                  "Rejecting",
                  job.status === "Open"
                    ? `Job ${id} cancelled.`
                    : `Job ${id} rejected. The budget went back to the client.`,
                  () => send(account, "reject", [job.id, ZERO32, "0x"]),
                )
              }
              data-testid={`job-${id}-reject-${role}`}
            >
              {job.status === "Open" ? "Cancel" : "Reject and refund"}
              {label}
            </button>
          );
        case "claimRefund":
          return (
            <button
              key={key}
              type="button"
              className="btn btn-glass btn-sm"
              disabled={busy}
              onClick={() =>
                void run("Returning the budget", `Job ${id} expired. The client is refunded.`, () =>
                  writeContractAsync({
                    address: JOBS.address,
                    abi: JOBS.abi,
                    functionName: "claimRefund",
                    args: [job.id],
                  }),
                )
              }
              data-testid={`job-${id}-refund`}
            >
              Refund the client
            </button>
          );
        default:
          return null;
      }
    });

  return (
    <article className="glass-strong flex flex-col gap-3 p-5" data-testid={`job-${id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-extrabold">
          Job {id} <span className="font-normal text-muted">· you are {mine.join(" and ")}</span>
        </h3>
        <span className="glass-chip px-2 py-0.5 text-xs" data-testid={`job-${id}-status`}>
          {job.status}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{job.description}</p>
      <Facts inset>
        <Stat label="Budget" value={<Arl value={job.budget} />} testId={`job-${id}-budget`} />
        <Stat
          label="Provider"
          value={<span className="font-mono text-xs">{short(job.provider)}</span>}
        />
        <Stat
          label="Evaluator"
          value={<span className="font-mono text-xs">{short(job.evaluator)}</span>}
        />
        <Stat
          label="Deadline"
          value={<span className="text-sm font-normal">{formatDate(job.expiredAt)}</span>}
          hint={now !== undefined ? timeLeft(now, job.expiredAt) : undefined}
        />
        {job.deliverable ? (
          <Stat
            label="Result reference"
            value={<span className="font-mono text-xs">{short(job.deliverable)}</span>}
            hint="keccak256 of the submitted result"
          />
        ) : null}
      </Facts>
      {buttons.length > 0 ? <div className="flex flex-wrap gap-2">{buttons}</div> : null}
      {rate}
    </article>
  );
}

/**
 * After a paid job has ended, its client can rate the provider's ERC-8004 agent. The rating is
 * public ERC-8004 feedback that names the job, so anyone can check it came from a paying client
 * (lib/reputation.ts).
 */
function RateProvider({
  job,
  services,
  ratings,
  busy,
  onStatus,
  onRated,
}: {
  job: Job;
  services: readonly ListedService[];
  ratings: Map<bigint, ServiceRatings> | undefined;
  busy: boolean;
  onStatus: (s: Status) => void;
  onRated: () => void;
}) {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const ended = job.status === "Completed" || job.status === "Rejected" || job.status === "Expired";
  if (!address || !client || !ended || !job.funded || !isAddressEqual(job.client, address))
    return null;
  // The provider's services; an agent's owner cannot rate itself.
  const targets = services.filter(
    (s) => isAddressEqual(s.terms.payTo, job.provider) && !isAddressEqual(s.owner, address),
  );
  if (targets.length === 0) return null;
  const id = String(job.id);

  const rate = async (service: ListedService, stars: number) => {
    try {
      onStatus({ kind: "busy", text: "Publishing your rating" });
      const value = starsToValue(stars);
      const { uri, hash } = encodeJobFeedback(
        {
          chainId: client.chain.id,
          agentId: service.agentId,
          client: address,
          jobs: JOBS.address,
          jobId: job.id,
          value,
        },
        new Date(),
      );
      const tx = await writeContractAsync({
        address: REPUTATION_REGISTRY,
        abi: reputationRegistryAbi,
        functionName: "giveFeedback",
        args: [service.agentId, BigInt(value), 0, RATING_TAG, JOB_TAG, "", uri, hash],
      });
      await client.waitForTransactionReceipt({ hash: tx });
      onRated();
      onStatus({
        kind: "done",
        text: `You rated ${service.name} ${String(stars)} of 5 for job ${id}.`,
      });
    } catch (e) {
      onStatus({ kind: "error", text: firstLine(e, "Could not publish the rating") });
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
      {targets.map((service) => {
        const agent = service.agentId.toString();
        const given = ratings
          ?.get(service.agentId)
          ?.ratings.find((r) => r.jobId === job.id && isAddressEqual(r.client, address));
        return (
          <div key={agent} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Rate {service.name}</span>
            {given ? (
              <span data-testid={`job-${id}-rated-${agent}`}>
                You rated {given.value / 20} of 5
              </span>
            ) : (
              STARS.map((stars) => (
                <button
                  key={stars}
                  type="button"
                  className="btn btn-glass btn-xs"
                  disabled={busy || ratings === undefined}
                  aria-label={`${String(stars)} of 5`}
                  onClick={() => void rate(service, stars)}
                  data-testid={`job-${id}-rate-${agent}-${String(stars)}`}
                >
                  {stars}
                </button>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
