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
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children ? <p className="mt-1 text-sm text-muted">{children}</p> : null}
    </div>
  );
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
    <div className="glass-chip p-4">
      <div className="text-xs tracking-wide text-subtle uppercase">{label}</div>
      <div className="stat-value-arl mt-1 text-xl font-semibold" data-testid={testId}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function Arl({ value, decimals }: { value: bigint | undefined; decimals?: number }) {
  if (value === undefined)
    return <span className="loading loading-dots loading-sm" aria-label="Loading" />;
  return (
    <span>
      {formatArl(value, decimals)} <span className="text-sm text-muted">ARL</span>
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
