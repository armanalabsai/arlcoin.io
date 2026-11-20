"use client";

import { useMemo, useState } from "react";
import { isAddressEqual } from "viem";
import type { Address } from "viem";

import { Arl, Facts, PageTitle, Stat } from "~~/components/arl/ui";
import { useAllJobs } from "~~/hooks/arl/useAllJobs";
import { EVALUATOR, EXPLORER } from "~~/lib/evaluator";
import type { Job } from "~~/lib/jobs";
import { agentRecords, filterJobs, scanTotals } from "~~/lib/scan";

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
