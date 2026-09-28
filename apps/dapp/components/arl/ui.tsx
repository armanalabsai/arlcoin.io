"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useAccount, useBlock } from "wagmi";

import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { checkAmount, formatArl } from "~~/lib/format";

/** Latest block timestamp: the chain's clock, which schedules are measured against. */
export function useChainTime(): bigint | undefined {
  const { data } = useBlock({ watch: true });
  return data?.timestamp;
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {children ? <p className="mt-1 text-sm text-muted">{children}</p> : null}
    </div>
  );
}

/** A list of label and value rows on one glass panel. */
export function Facts({ children, inset = false }: { children: ReactNode; inset?: boolean }) {
  // Inside another glass panel the list is outlined, so glass is never stacked on glass.
  const look = inset ? "rounded-xl border border-white/10" : "glass-strong";
  return <dl className={`${look} divide-y divide-white/8`}>{children}</dl>;
}

export function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right">
        <div className="stat-value-arl text-base font-semibold" data-testid={testId}>
          {value}
        </div>
        {hint ? <div className="text-xs text-subtle">{hint}</div> : null}
      </dd>
    </div>
  );
}

export function Arl({ value, decimals }: { value: bigint | undefined; decimals?: number }) {
  if (value === undefined) return <span className="text-sm font-normal text-subtle">reading</span>;
  return (
    <span>
      {formatArl(value, decimals)} <span className="text-xs font-medium text-muted">ARL</span>
    </span>
  );
}

/** Renders children once a wallet is connected; otherwise a connect prompt. */
export function RequireWallet({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount();
  if (isConnected) return <>{children}</>;
  return (
    <div className="glass-strong flex flex-col items-center gap-3 p-8 text-center">
      <p className="text-muted">Connect a wallet to continue.</p>
      <RainbowKitCustomConnectButton />
    </div>
  );
}

/** An ARL amount field with a Max button and a submit action. */
export function AmountForm({
  label,
  action,
  available,
  busy,
  onSubmit,
  testId,
}: {
  label: string;
  action: string;
  available: bigint | undefined;
  busy: boolean;
  onSubmit: (amount: bigint) => Promise<void>;
  testId: string;
}) {
  const [text, setText] = useState("");
  const checked = checkAmount(text, available);
  const showError = text.trim() !== "" && !checked.ok;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!checked.ok || busy) return;
        void onSubmit(checked.value).then(() => setText(""));
      }}
    >
      <label className="text-sm text-muted" htmlFor={`${testId}-input`}>
        {label}
        {available !== undefined ? (
          <span className="float-right">Available: {formatArl(available)}</span>
        ) : null}
      </label>
      <div className="join w-full">
        <input
          id={`${testId}-input`}
          data-testid={`${testId}-input`}
          className="input glass-field join-item w-full"
          inputMode="decimal"
          placeholder="0.0"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={showError}
        />
        <button
          type="button"
          className="btn btn-glass join-item"
          disabled={available === undefined || available === 0n}
          onClick={() =>
            available !== undefined && setText(formatArl(available, 18).replace(/,/g, ""))
          }
        >
          Max
        </button>
        <button
          type="submit"
          className="btn btn-primary join-item"
          disabled={!checked.ok || busy}
          data-testid={`${testId}-submit`}
        >
          {busy ? <span className="loading loading-spinner loading-sm" /> : action}
        </button>
      </div>
      {showError ? <p className="text-xs text-error">{checked.error}</p> : null}
    </form>
  );
}
