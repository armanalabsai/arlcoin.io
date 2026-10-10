"use client";

import { useState } from "react";
import type { Address } from "viem";

import { IS_LOCAL } from "~~/lib/contracts";
import { callOperator } from "~~/lib/operatorClient";

/** Public faucets that hand out Base Sepolia ETH for gas. */
const GAS_FAUCETS = [
  { name: "Coinbase CDP faucet", url: "https://portal.cdp.coinbase.com/products/faucet" },
  { name: "Alchemy faucet", url: "https://www.alchemy.com/faucets/base-sepolia" },
] as const;

/**
 * Testnet only: asks the ARL testnet operator for 1,000 testnet ARL (once a day per account,
 * while the account holds less). Testnet ARL has no value. Hidden on the local chain.
 */
export function Faucet({ account, onPaid }: { account: Address; onPaid?: () => void }) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "busy" }
    | { kind: "done"; tx: string }
    | { kind: "error"; text: string }
  >({ kind: "idle" });
  if (IS_LOCAL) return null;

  const ask = async () => {
    setState({ kind: "busy" });
    try {
      const r = await callOperator<{ transaction: string }>("faucet", { account });
      setState({ kind: "done", tx: r.transaction });
      onPaid?.();
    } catch (e) {
      setState({ kind: "error", text: e instanceof Error ? e.message : "The faucet failed" });
    }
  };

  return (
    <section className="glass-strong flex flex-col gap-3 p-5" aria-labelledby="faucet-heading">
      <h2 id="faucet-heading" className="text-sm font-extrabold">
        Testnet ARL
      </h2>
      <p className="text-sm text-muted">
        This app runs on Base Sepolia, a test network. Get 1,000 testnet ARL to try staking, jobs,
        payments and private voting. Testnet ARL has no value. Gas is paid in Base Sepolia ETH:{" "}
        {GAS_FAUCETS.map((f, i) => (
          <span key={f.url}>
            {i > 0 ? ", " : ""}
            <a className="link" href={f.url} target="_blank" rel="noreferrer">
              {f.name}
            </a>
          </span>
        ))}
        .
      </p>
      <div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => void ask()}
          disabled={state.kind === "busy"}
          data-testid="faucet"
        >
          {state.kind === "busy" ? "Sending…" : "Get 1,000 testnet ARL"}
        </button>
      </div>
      {state.kind === "done" ? (
        <p className="text-sm text-success" role="status">
          Sent.{" "}
          <a
            className="link"
            href={`https://sepolia.basescan.org/tx/${state.tx}`}
            target="_blank"
            rel="noreferrer"
          >
            View the transaction
          </a>
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p className="text-sm text-error" role="alert">
          {state.text}
        </p>
      ) : null}
    </section>
  );
}
