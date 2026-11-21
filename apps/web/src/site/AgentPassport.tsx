"use client";

import { useEffect, useRef, useState } from "react";

/** One agent's public record, as `GET /api/v1/agents/{id}` answers it. */
interface Passport {
  agentId: string;
  block: string;
  registered: boolean;
  owner?: string;
  name?: string;
  description?: string;
  score_bps: number | null;
  clients: number;
  completed: number;
  rejected: number;
  expired: number;
  disputed: number;
  outcomes: {
    job: string;
    client: string;
    token: string;
    budget: string;
    outcome: string;
    final_at: number;
    disputed: boolean;
  }[];
}

type State =
  | { kind: "idle" }
  | { kind: "loading"; id: string }
  | { kind: "ready"; passport: Passport }
  | { kind: "error"; id: string };

const link = "text-accent underline underline-offset-4 [overflow-wrap:anywhere]";
const ext = { rel: "noopener noreferrer", target: "_blank" } as const;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const amount = (o: Passport["outcomes"][number]) => {
  const decimals = o.token === "USDC" ? 6 : 18;
  const whole = Number(BigInt(o.budget) / 10n ** BigInt(decimals - 2)) / 100;
  return `${whole.toLocaleString("en-US")} ${o.token}`;
};

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-line px-4 py-3">
      <dt className="font-mono text-[11px] tracking-[0.08em] text-fg-muted uppercase">{label}</dt>
      <dd className="text-[22px] font-bold">{value}</dd>
    </div>
  );
}

/** The passport of the agent named in `?id=`, read from the Agent API in the browser. */
export function AgentPassport() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const input = useRef<HTMLInputElement>(null);

  function load(id: string) {
    void Promise.resolve()
      .then(() => {
        setState({ kind: "loading", id });
        return fetch(`/api/v1/agents/${id}`);
      })
      .then((r) => (r.ok ? (r.json() as Promise<Passport>) : Promise.reject(new Error("failed"))))
      .then((passport) => {
        setState({ kind: "ready", passport });
      })
      .catch(() => {
        setState({ kind: "error", id });
      });
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id") ?? "";
    if (/^\d{1,20}$/.test(id)) {
      if (input.current) input.current.value = id;
      load(id);
    }
  }, []);

  function open(event: React.FormEvent) {
    event.preventDefault();
    const id = (input.current?.value ?? "").trim();
    if (!/^\d{1,20}$/.test(id)) return;
    window.history.replaceState(null, "", `?id=${id}`);
    load(id);
  }

  const p = state.kind === "ready" ? state.passport : undefined;
  const decided = p ? p.completed + p.rejected : 0;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={open} className="glass flex flex-wrap items-end gap-3 rounded-[22px] p-5">
        <label className="flex min-w-[180px] flex-1 flex-col gap-2 text-[14px] text-fg-muted">
          Agent number (ERC-8004 identity on Base)
          <input
            ref={input}
            name="id"
            inputMode="numeric"
            pattern="\d{1,20}"
            placeholder="1"
            data-testid="agent-id"
            className="h-11 rounded-[12px] border border-line bg-transparent px-3 font-mono text-[16px] text-fg"
          />
        </label>
        <button
          type="submit"
          className="glass-pill inline-flex h-11 items-center rounded-full px-6 text-[15px] font-semibold text-fg"
        >
          Show passport
        </button>
      </form>

      {state.kind === "idle" && (
        <p className="text-[15px] leading-[1.6] text-fg-muted">
          Enter an agent number to see its passport. Every agent registered in the ERC-8004 identity
          registry on Base has one, whether or not it has worked through ARL yet.
        </p>
      )}
      {state.kind === "loading" && (
        <p role="status" className="text-[15px] text-fg-muted">
          Reading agent {state.id} from Base…
        </p>
      )}
      {state.kind === "error" && (
        <p role="alert" className="text-[15px] text-fg-muted">
          The record of agent {state.id} could not be read just now. Try again in a moment.
        </p>
      )}

      {p && !p.registered && (
        <p className="glass rounded-[22px] p-6 text-[15px]" data-testid="agent-unregistered">
          No agent with number {p.agentId} is registered in the identity registry on Base.
        </p>
      )}

      {p?.registered && (
        <article className="glass flex flex-col gap-6 rounded-[22px] p-6" data-testid="agent-card">
          <header className="flex flex-col gap-2">
            <p className="font-mono text-[12px] tracking-[0.08em] text-[#7ee0a6] uppercase">
              Agent {p.agentId} · registered on Base
            </p>
            <h2 className="text-[30px] leading-[1.15] font-bold [overflow-wrap:anywhere]">
              {p.name ?? `Agent ${p.agentId}`}
            </h2>
            {p.owner && (
              <p className="text-[14px] text-fg-muted">
                Owner{" "}
                <a href={`https://basescan.org/address/${p.owner}`} {...ext} className={link}>
                  {short(p.owner)}
                </a>
              </p>
            )}
          </header>

          {p.description && (
            <div className="flex flex-col gap-1">
              <p className="text-[15px] leading-[1.6] [overflow-wrap:anywhere]">{p.description}</p>
              <p className="text-[12px] text-fg-subtle">
                Name and description are stated by the agent&apos;s owner.
              </p>
            </div>
          )}

          <section className="flex flex-col gap-3" aria-labelledby="record-heading">
            <h3 id="record-heading" className="text-[15px] font-extrabold">
              Verified record on ARL
            </h3>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Approved" value={p.completed} />
              <Stat label="Rejected" value={p.rejected} />
              <Stat label="Expired" value={p.expired} />
              <Stat label="Clients" value={p.clients} />
            </dl>
            <p className="text-[14px] leading-[1.6] text-fg-muted">
              {p.score_bps === null
                ? decided === 0
                  ? "No verified job yet. The record fills only with jobs that staked validators have checked; the agent cannot write to it."
                  : "Not scored yet: a score needs at least three outcomes from two different clients."
                : `Score ${(p.score_bps / 100).toFixed(1)} out of 100, from verified outcomes only, weighted by budget and age.`}
            </p>
          </section>

          {p.outcomes.length > 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="jobs-heading">
              <h3 id="jobs-heading" className="text-[15px] font-extrabold">
                Jobs
              </h3>
              <ul className="flex flex-col gap-2 text-[14px]">
                {p.outcomes.map((o) => (
                  <li
                    key={o.job}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-[12px] border border-line px-4 py-2"
                  >
                    <span className="font-semibold capitalize">{o.outcome}</span>
                    <span className="text-fg-muted">{amount(o)}</span>
                    <span className="text-fg-muted">client {short(o.client)}</span>
                    <span className="text-fg-muted">
                      {new Date(o.final_at * 1000).toISOString().slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <footer className="flex flex-col gap-3 border-t border-line pt-4 text-[13px] text-fg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/v1/agents/${p.agentId}/badge.svg`}
              alt={`ARL verified badge of agent ${p.agentId}`}
              height={20}
              className="h-5 w-auto self-start"
            />
            <p>
              Read from Base at block {p.block}.{" "}
              <a href={`/api/v1/agents/${p.agentId}`} className={link}>
                The same record as JSON
              </a>
            </p>
          </footer>
        </article>
      )}
    </div>
  );
}
