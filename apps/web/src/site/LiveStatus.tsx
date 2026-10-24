"use client";

import { useEffect, useState } from "react";

// "Live on Base" indicator next to the brand link, with the Base mark. It reads the ARL token's
// total supply from the public Base Mainnet RPC and says "live" only while the chain answers with
// it; the label never claims more than that answer. It links to the token on Basescan.
const RPC = "https://mainnet.base.org";
const TOKEN = "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4";
const LINK = `https://basescan.org/token/${TOKEN}`;
const POLL_MS = 30_000;

type State = { kind: "checking" } | { kind: "live"; supply: bigint } | { kind: "down" };

async function totalSupply(signal: AbortSignal): Promise<bigint> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // totalSupply() of the ARL token, read at the latest block.
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: TOKEN, data: "0x18160ddd" }, "latest"],
    }),
    signal,
  });
  if (!res.ok) throw new Error(`RPC ${String(res.status)}`);
  const body = (await res.json()) as { result?: unknown };
  if (typeof body.result !== "string" || !/^0x[0-9a-f]+$/i.test(body.result)) {
    throw new Error("RPC: no answer");
  }
  const supply = BigInt(body.result);
  if (supply === 0n) throw new Error("RPC: no token");
  return supply / 10n ** 18n;
}

export function LiveStatus() {
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | undefined;
    const check = async () => {
      controller?.abort();
      controller = new AbortController();
      const timer = setTimeout(() => controller?.abort(), 8_000);
      try {
        const supply = await totalSupply(controller.signal);
        if (!stopped) setState({ kind: "live", supply });
      } catch {
        if (!stopped) setState({ kind: "down" });
      } finally {
        clearTimeout(timer);
      }
    };
    void check();
    const id = setInterval(() => void check(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
      controller?.abort();
    };
  }, []);

  const live = state.kind === "live";
  const title =
    state.kind === "live"
      ? `ARL on Base Mainnet: ${state.supply.toLocaleString("en-US")} ARL total supply. Open on Basescan.`
      : state.kind === "down"
        ? "Base Mainnet is not answering right now. Open ARL on Basescan."
        : "Checking ARL on Base Mainnet.";

  return (
    <a
      href={LINK}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      className="inline-flex min-h-11 items-center"
      data-state={state.kind}
    >
      <span className="glass-pill inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] whitespace-nowrap text-fg">
        <span aria-hidden="true" className="relative inline-flex size-2">
          {live ? (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
          ) : null}
          <span
            className={`relative inline-flex size-2 rounded-full ${
              live ? "bg-emerald-400" : state.kind === "down" ? "bg-amber-400" : "bg-fg-subtle"
            }`}
          />
        </span>
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0">
          <rect width="16" height="16" rx="3" fill="#0000FF" />
        </svg>
        <span className="hidden sm:inline">{live ? "Live on Base" : "Base"}</span>
        <span className="hidden min-[480px]:inline sm:hidden">
          {live ? "Live on Base" : "Base"}
        </span>
      </span>
    </a>
  );
}
