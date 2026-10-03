"use client";

// Deploy: signs a prepared ARL deployment from a phone wallet (for example inside the wallet's own
// browser), one transaction at a time. See lib/deploySteps.ts for the checks applied to the file.
// This page never asks for, receives or stores a seed phrase, private key or password.

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  type Address,
  type EIP1193Provider,
} from "viem";
import { baseSepolia } from "viem/chains";

import { Facts, PageTitle, Stat } from "~~/components/arl/ui";
import {
  checkBeforeSend,
  describeStep,
  parseRun,
  publishedPlanPath,
  type DeployRun,
  type DeployStep,
} from "~~/lib/deploySteps";
import { BASE_SEPOLIA_CHAIN_ID, localChain } from "~~/lib/network";

type Status =
  { kind: "waiting" } | { kind: "sent"; hash: string } | { kind: "failed"; error: string };

const noSubscription = () => () => undefined;

const chainFor = (id: number) =>
  id === BASE_SEPOLIA_CHAIN_ID ? baseSepolia : localChain(process.env.NEXT_PUBLIC_ARL_RPC_URL);

export default function DeployPage() {
  const [run, setRun] = useState<DeployRun>();
  const [error, setError] = useState<string>();
  // Static hosting cannot send X-Frame-Options, so the screen refuses to run inside a frame,
  // where another site could overlay it.
  const framed = useSyncExternalStore(
    noSubscription,
    () => window.top !== window.self,
    () => false,
  );

  useEffect(() => {
    if (window.top !== window.self) return;
    const name = new URLSearchParams(window.location.search).get("plan");
    if (!name) return;
    void (async () => {
      try {
        const res = await fetch(publishedPlanPath(name, process.env.NEXT_PUBLIC_BASE_PATH ?? ""), {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`the prepared plan "${name}" was not found`);
        setRun(parseRun((await res.json()) as unknown));
      } catch (e) {
        setError(e instanceof Error ? e.message : "unreadable plan");
      }
    })();
  }, []);

  if (framed) {
    return (
      <p className="text-sm text-error" data-testid="deploy-framed">
        This page cannot be used inside a frame. Open it directly in your wallet&apos;s browser.
      </p>
    );
  }

  const load = async (file: File | undefined) => {
    setError(undefined);
    setRun(undefined);
    if (!file) return;
    try {
      setRun(parseRun(JSON.parse(await file.text()) as unknown));
    } catch (e) {
      setError(e instanceof Error ? e.message : "unreadable file");
    }
  };

  return (
    <>
      <PageTitle title="Deploy">
        Signs a prepared ARL deployment on Base Sepolia with your own wallet, one transaction at a
        time. Each transaction is explained before you sign it.
      </PageTitle>
      <div className="flex flex-col gap-6">
        <section
          className="glass-strong flex flex-col gap-2 p-5 text-sm"
          data-testid="deploy-safety"
        >
          <p className="font-semibold">Never type a seed phrase, private key or password here.</p>
          <p className="text-muted">
            This page only asks your wallet to sign the transactions listed below. Your wallet shows
            each one again before you confirm it. Base Mainnet is refused.
          </p>
        </section>
        <section className="glass-strong flex flex-col gap-3 p-5" aria-labelledby="plan-heading">
          <h2 id="plan-heading" className="text-sm font-semibold">
            1 · Prepared transactions
          </h2>
          <input
            type="file"
            accept="application/json,.json"
            className="file-input glass-field w-full"
            onChange={(e) => void load(e.target.files?.[0])}
            data-testid="deploy-file"
          />
          {error ? (
            <p className="text-xs text-error" data-testid="deploy-error">
              Refused: {error}
            </p>
          ) : null}
        </section>
        {run ? <Signer run={run} /> : null}
      </div>
    </>
  );
}

function Signer({ run }: { run: DeployRun }) {
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const provider =
    typeof window === "undefined" ? undefined : (window as { ethereum?: EIP1193Provider }).ethereum;
  const chain = chainFor(run.chainId);

  const connect = async () => {
    setMessage(undefined);
    if (!provider) return setMessage("No wallet found. Open this page in your wallet's browser.");
    const [first] = await provider.request({ method: "eth_requestAccounts" });
    setAccount(first ? getAddress(first) : undefined);
    setChainId(Number(await provider.request({ method: "eth_chainId" })));
  };

  const switchChain = async () => {
    if (!provider) return;
    const id = `0x${run.chainId.toString(16)}` as const;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: id }] });
    } catch {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: id,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [...chain.rpcUrls.default.http],
            blockExplorerUrls: chain.blockExplorers
              ? [chain.blockExplorers.default.url]
              : undefined,
          },
        ],
      });
    }
    setChainId(Number(await provider.request({ method: "eth_chainId" })));
  };

  const sign = async (step: DeployStep) => {
    if (!provider || !account || chainId === undefined) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const reader = createPublicClient({ chain, transport: custom(provider) });
      const nonce = await reader.getTransactionCount({ address: account, blockTag: "pending" });
      const problem = checkBeforeSend(step, { account, chainId, nonce }, run.chainId);
      if (problem) return setMessage(problem);
      const wallet = createWalletClient({ account, chain, transport: custom(provider) });
      const hash = await wallet.sendTransaction({
        to: step.kind === "safe" ? step.factory : undefined,
        data: step.data,
        gas: step.gas,
      });
      const receipt = await reader.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("the transaction reverted");
      if (
        step.kind === "create" &&
        receipt.contractAddress?.toLowerCase() !== step.address.toLowerCase()
      ) {
        throw new Error(`created ${String(receipt.contractAddress)}, expected ${step.address}`);
      }
      setStatus((s) => ({ ...s, [step.index]: { kind: "sent", hash } }));
    } catch (e) {
      const error = e instanceof Error ? (e.message.split("\n")[0] ?? "failed") : "failed";
      setStatus((s) => ({ ...s, [step.index]: { kind: "failed", error } }));
    } finally {
      setBusy(false);
    }
  };

  const next = run.steps.find((s) => status[s.index]?.kind !== "sent");
  const wrongChain = chainId !== undefined && chainId !== run.chainId;

  return (
    <section className="glass-strong flex flex-col gap-4 p-5" aria-labelledby="sign-heading">
      <h2 id="sign-heading" className="text-sm font-semibold">
        2 · Sign
      </h2>
      <Facts inset>
        <Stat label="Network" value={<span className="text-sm font-normal">{chain.name}</span>} />
        <Stat label="Prepared for" value={<span className="font-mono text-xs">{run.from}</span>} />
        <Stat label="Transactions" value={String(run.steps.length)} />
      </Facts>
      <div className="flex flex-wrap gap-2">
        {!account ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void connect()}
            data-testid="deploy-connect"
          >
            Connect wallet
          </button>
        ) : (
          <span className="font-mono text-xs" data-testid="deploy-account">
            {account}
          </span>
        )}
        {wrongChain ? (
          <button
            type="button"
            className="btn btn-glass btn-sm"
            onClick={() => void switchChain()}
            data-testid="deploy-switch"
          >
            Switch to {chain.name}
          </button>
        ) : null}
      </div>
      {message ? (
        <p className="text-xs text-error" data-testid="deploy-message">
          {message}
        </p>
      ) : null}
      <ol className="flex flex-col gap-3" data-testid="deploy-steps">
        {run.steps.map((step) => {
          const { title, detail } = describeStep(step);
          const s = status[step.index];
          const current = next?.index === step.index;
          return (
            <li
              key={step.index}
              className="rounded-xl border border-white/10 p-3"
              data-testid={`deploy-step-${String(step.index + 1)}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {String(step.index + 1)}. {title}
                </span>
                <span
                  className="text-xs text-subtle"
                  data-testid={`deploy-status-${String(step.index + 1)}`}
                >
                  {s?.kind === "sent"
                    ? "Done"
                    : s?.kind === "failed"
                      ? `Failed: ${s.error}`
                      : current
                        ? "Next"
                        : "Waiting"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{detail}</p>
              {s?.kind === "sent" ? (
                <p className="mt-1 font-mono text-xs break-all">{s.hash}</p>
              ) : null}
              {current && account && !wrongChain ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm mt-2"
                  disabled={busy}
                  onClick={() => void sign(step)}
                  data-testid="deploy-sign"
                >
                  {busy ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    "Sign this transaction"
                  )}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {!next ? (
        <p className="text-sm" data-testid="deploy-done">
          All transactions are confirmed. Next: run the read-only verification (VerifyARL and the
          deployment proof) before anything else.
        </p>
      ) : null}
    </section>
  );
}
