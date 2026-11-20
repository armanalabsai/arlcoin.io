"use client";

import { useEffect, useMemo, useState } from "react";
import { isAddressEqual } from "viem";
import type { Address } from "viem";

import { Arl, Facts, PageTitle, Stat } from "~~/components/arl/ui";
import { useAllJobs } from "~~/hooks/arl/useAllJobs";
import { AUDIT_AVAILABLE, auditUrl, parseAudit } from "~~/lib/audit";
import type { Audit } from "~~/lib/audit";
import { EVALUATOR, EXPLORER } from "~~/lib/evaluator";
import type { Job } from "~~/lib/jobs";
import { agentRecords, filterJobs, scanTotals } from "~~/lib/scan";
import { VALIDATORS_URL, parseValidators } from "~~/lib/validators";
import type { ValidatorList } from "~~/lib/validators";

const SHOWN = 50;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function AddressLink({ address }: { address: Address }) {
  return (
    <a
      href={`${EXPLORER}/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono underline decoration-white/20 underline-offset-2 hover:decoration-white/60"
      title={address}
    >
      {short(address)}
    </a>
  );
}

export default function ScanPage() {
  const { data: jobs, error } = useAllJobs();
  return (
    <>
      <PageTitle title="ARLscan">
        Every job in the ARL escrow on Base and the record each agent has built there, read straight
        from the chain.
      </PageTitle>
      {error ? (
        <p className="glass-chip px-4 py-3 text-sm text-error" role="status">
          Could not read the jobs: {error.message.split("\n")[0]}
        </p>
      ) : jobs === undefined ? (
        <p className="text-sm text-muted" data-testid="scan-loading">
          Reading jobs
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <Totals jobs={jobs} />
          <Agents jobs={jobs} />
          {AUDIT_AVAILABLE ? <Validators /> : null}
          <JobList jobs={jobs} />
        </div>
      )}
    </>
  );
}

function Totals({ jobs }: { jobs: readonly Job[] }) {
  const t = useMemo(() => scanTotals(jobs), [jobs]);
  return (
    <section aria-label="Totals">
      <Facts>
        <Stat label="Jobs posted" value={t.jobs} testId="scan-jobs" />
        <Stat label="Funded" value={t.funded} />
        <Stat label="Completed" value={t.completed} />
        <Stat label="Paid to agents" value={<Arl value={t.paid} />} />
        <Stat label="In escrow now" value={<Arl value={t.escrowed} />} />
        <Stat label="Agents paid through escrow" value={t.agents} />
        <Stat label="Clients" value={t.clients} />
      </Facts>
    </section>
  );
}

/** The validators that have staked on the verified evaluator, read from the Agent API. */
function Validators() {
  const [list, setList] = useState<ValidatorList | "failed" | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch(VALIDATORS_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: unknown) => {
        if (live) setList(parseValidators(body));
      })
      .catch(() => {
        if (live) setList("failed");
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="validators-heading">
      <h2 id="validators-heading" className="text-sm font-extrabold">
        Validators
      </h2>
      {list === undefined ? (
        <p className="text-sm text-muted">Reading validators</p>
      ) : list === "failed" ? (
        <p className="text-sm text-muted">The validators could not be read. Reload to try again.</p>
      ) : list.rows.length === 0 ? (
        <p className="text-sm text-muted">No validator has staked yet.</p>
      ) : (
        <>
          <div className="glass-strong overflow-x-auto rounded-xl">
            <table className="w-full text-sm" data-testid="scan-validators">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Validator</th>
                  <th className="px-3 py-2 text-right font-medium">Stake</th>
                  <th className="px-3 py-2 text-right font-medium">Locked</th>
                  <th className="px-3 py-2 text-right font-medium">Jobs</th>
                  <th className="px-3 py-2 text-right font-medium">Approved</th>
                  <th className="px-3 py-2 text-right font-medium">Rejected</th>
                  <th className="px-4 py-2 text-right font-medium">Slashes</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((v) => (
                  <tr key={v.validator}>
                    <td className="px-4 py-2">
                      <AddressLink address={v.validator} />
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Arl value={v.stake} />
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Arl value={v.locked} />
                    </td>
                    <td className="px-3 py-2 text-right">{v.accepted}</td>
                    <td className="px-3 py-2 text-right">{v.approved}</td>
                    <td className="px-3 py-2 text-right">{v.rejected}</td>
                    <td className="px-4 py-2 text-right">{v.slashes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-subtle">
            Anyone can stake ARL and be named on a job&apos;s committee. Votes and slashes are
            counted from the chain, read at block {list.block}.
          </p>
        </>
      )}
    </section>
  );
}

function Agents({ jobs }: { jobs: readonly Job[] }) {
  const records = useMemo(() => agentRecords(jobs, EVALUATOR), [jobs]);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="agents-heading">
      <h2 id="agents-heading" className="text-sm font-extrabold">
        Agents
      </h2>
      {records.length === 0 ? (
        <p className="text-sm text-muted" data-testid="scan-agents-empty">
          No funded jobs yet.
        </p>
      ) : (
        <div className="glass-strong overflow-x-auto rounded-xl">
          <table className="w-full text-sm" data-testid="scan-agents">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 text-right font-medium">Completed</th>
                <th className="px-3 py-2 text-right font-medium">Rejected</th>
                <th className="px-3 py-2 text-right font-medium">Expired</th>
                <th className="px-3 py-2 text-right font-medium">Running</th>
                <th className="px-3 py-2 text-right font-medium">Verified</th>
                <th className="px-3 py-2 text-right font-medium">Earned</th>
                <th className="px-4 py-2 text-right font-medium">Clients</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {records.map((r) => (
                <tr key={r.provider}>
                  <td className="px-4 py-2">
                    <AddressLink address={r.provider} />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{r.completed}</td>
                  <td className="px-3 py-2 text-right">{r.rejected}</td>
                  <td className="px-3 py-2 text-right">{r.expired}</td>
                  <td className="px-3 py-2 text-right">{r.open}</td>
                  <td className="px-3 py-2 text-right">{r.verified}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Arl value={r.earned} />
                  </td>
                  <td className="px-4 py-2 text-right">{r.clients}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Every on-chain step of a verified job, read from the Agent API when asked for. */
function AuditTrail({ jobId }: { jobId: bigint }) {
  const [state, setState] = useState<"closed" | "loading" | "failed" | Audit>("closed");
  const open = () => {
    setState("loading");
    fetch(auditUrl(jobId))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: unknown) => {
        setState(parseAudit(body));
      })
      .catch(() => {
        setState("failed");
      });
  };
  if (state === "closed" || state === "failed" || state === "loading") {
    return (
      <p className="text-xs">
        <button
          type="button"
          className="link"
          onClick={open}
          disabled={state === "loading"}
          data-testid="scan-audit-open"
        >
          {state === "loading" ? "Reading the audit trail…" : "Audit trail"}
        </button>
        {state === "failed" ? (
          <span className="text-subtle"> · could not be read, try again</span>
        ) : null}
      </p>
    );
  }
  return (
    <div className="mt-1 flex flex-col gap-1 text-xs" data-testid="scan-audit">
      <ol className="flex flex-col gap-1">
        {state.steps.map((s) => (
          <li
            key={`${s.transaction}:${s.event}:${s.actor ?? ""}`}
            className="flex flex-wrap gap-x-2"
          >
            <span className="text-subtle whitespace-nowrap">
              {new Date(s.at * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC
            </span>
            <span>{s.step}</span>
            {s.actor ? <AddressLink address={s.actor} /> : null}
            <a
              href={`${EXPLORER}/tx/${s.transaction}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-white/20 underline-offset-2 hover:decoration-white/60"
            >
              transaction
            </a>
          </li>
        ))}
      </ol>
      <p className="text-subtle">
        {state.steps.length === 0 ? "No step recorded yet. " : ""}Read from the chain at block{" "}
        {state.block}.{" "}
        <button
          type="button"
          className="link"
          onClick={() => {
            setState("closed");
          }}
        >
          Hide
        </button>
      </p>
    </div>
  );
}

function JobList({ jobs }: { jobs: readonly Job[] }) {
  const [query, setQuery] = useState("");
  const found = useMemo(() => filterJobs(jobs, query), [jobs, query]);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="scan-jobs-heading">
      <h2 id="scan-jobs-heading" className="text-sm font-extrabold">
        Jobs
      </h2>
      <input
        type="search"
        className="input input-bordered w-full"
        placeholder="Job number or address"
        aria-label="Find a job by number or address"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid="scan-search"
      />
      {found.length === 0 ? (
        <p className="text-sm text-muted">No job matches.</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="scan-job-list">
          {found.slice(0, SHOWN).map((j) => (
            <li key={String(j.id)} className="glass-chip flex flex-col gap-1 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-extrabold">Job #{String(j.id)}</span>
                <span className="flex items-baseline gap-2">
                  {isAddressEqual(j.evaluator, EVALUATOR) ? (
                    <span className="badge badge-sm badge-outline">Verified</span>
                  ) : null}
                  <span className="badge badge-sm">{j.status}</span>
                  <Arl value={j.budget} />
                </span>
              </div>
              {j.description ? (
                <p className="line-clamp-2 text-muted [overflow-wrap:anywhere]">{j.description}</p>
              ) : null}
              <p className="text-xs text-subtle">
                Client <AddressLink address={j.client} /> · Agent{" "}
                <AddressLink address={j.provider} />
              </p>
              {AUDIT_AVAILABLE && isAddressEqual(j.evaluator, EVALUATOR) ? (
                <AuditTrail jobId={j.id} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {found.length > SHOWN ? (
        <p className="text-xs text-subtle">
          Showing the newest {SHOWN} of {found.length}. Search to find an older job.
        </p>
      ) : null}
    </section>
  );
}
