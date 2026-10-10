"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContracts, useWriteContract } from "wagmi";

import { Arl, Facts, PageTitle, RequireWallet, Stat, useChainTime } from "~~/components/arl/ui";
import deployedContracts from "~~/contracts/deployedContracts";
import { useTransactor } from "~~/hooks/scaffold-eth";
import {
  ClaimError,
  claimArgs,
  claimStatus,
  distributorAbi,
  mismatches,
  parseClaimList,
  type ClaimList,
} from "~~/lib/claim";
import { formatDate } from "~~/lib/format";

/** ARL on the networks where the app knows its address: only the local fixture today. */
function knownArl(chainId: number) {
  return chainId === 31337 ? deployedContracts[31337].ARLToken.address : undefined;
}

export default function ClaimPage() {
  return (
    <>
      <PageTitle title="Claim">
        Whitelist sign-ups claim their Public Launch ARL here, free, during the 60-day claim window.
        The list is published before the window opens; a claim always pays the listed address and
        never asks for a payment.
      </PageTitle>
      <RequireWallet>
        <ClaimLoader />
      </RequireWallet>
    </>
  );
}

type Loaded =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "invalid"; reason: string }
  | { kind: "ready"; list: ClaimList };

function ClaimLoader() {
  const { chainId } = useAccount();
  // Kept with the network it was read for, so switching networks never shows the old list.
  const [result, setResult] = useState<{ chainId: number; loaded: Loaded } | undefined>();
  const loaded: Loaded = result && result.chainId === chainId ? result.loaded : { kind: "loading" };

  useEffect(() => {
    if (chainId === undefined) return;
    let live = true;
    const url = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/claims/${String(chainId)}.json`;
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) return { kind: "none" } as const;
        if (!res.ok)
          throw new ClaimError(`the claim list could not be read (${String(res.status)})`);
        return { kind: "ready", list: parseClaimList(await res.json(), chainId) } as const;
      })
      .catch((e: unknown) => ({
        kind: "invalid" as const,
        reason: e instanceof Error ? e.message : String(e),
      }))
      .then((r) => {
        if (live) setResult({ chainId, loaded: r });
      });
    return () => {
      live = false;
    };
  }, [chainId]);

  if (loaded.kind === "loading") {
    return <div className="glass-strong p-8 text-center text-muted">Reading the claim list…</div>;
  }
  if (loaded.kind === "none") {
    return (
      <div className="glass-strong p-8 text-center text-muted" data-testid="claim-none">
        No claim list is published for this network yet. The Public Launch claim opens after the
        Base Mainnet launch; until then nothing can be claimed, and anyone offering an ARL claim
        elsewhere is not ARL.
      </div>
    );
  }
  if (loaded.kind === "invalid") {
    return (
      <div className="glass-strong p-8 text-center text-error" data-testid="claim-invalid">
        The published claim list did not pass its checks, so no claim is offered: {loaded.reason}
      </div>
    );
  }
  return <Claim list={loaded.list} />;
}

function Claim({ list }: { list: ClaimList }) {
  const { address } = useAccount();
  const now = useChainTime();
  const entry = address ? list.claims.get(address) : undefined;
  const contract = { address: list.distributor, abi: distributorAbi } as const;
  const { data, refetch } = useReadContracts({
    allowFailure: false,
    contracts: [
      { ...contract, functionName: "token" },
      { ...contract, functionName: "merkleRoot" },
      { ...contract, functionName: "claimEnd" },
      { ...contract, functionName: "isClaimed", args: [entry?.index ?? 0n] },
    ],
  });
  const { writeContractAsync } = useWriteContract();
  const transact = useTransactor();
  const [busy, setBusy] = useState(false);

  if (!data || now === undefined || !address) {
    return <div className="glass-strong p-8 text-center text-muted">Reading the distributor…</div>;
  }
  const [token, merkleRoot, claimEnd, claimed] = data;
  const problems = mismatches(list, { token, merkleRoot, claimEnd }, knownArl(list.chainId));
  if (problems.length > 0) {
    return (
      <div className="glass-strong p-8 text-center text-error" data-testid="claim-invalid">
        The distributor does not match the published list, so no claim is offered:{" "}
        {problems.join("; ")}.
      </div>
    );
  }
  const status = claimStatus(list, address, entry ? claimed : false, claimEnd, now);

  async function claim() {
    if (status.kind !== "open" || !address) return;
    setBusy(true);
    try {
      await transact(() =>
        writeContractAsync({
          ...contract,
          functionName: "claim",
          args: claimArgs(address, status.claim),
        }),
      );
      await refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Facts>
        <Stat
          label="Your claim"
          testId="claim-amount"
          value={
            status.kind === "not-listed" ? "Not on the list" : <Arl value={status.claim.amount} />
          }
        />
        <Stat
          label="Status"
          testId="claim-status"
          value={
            {
              "not-listed": "Nothing to claim",
              claimed: "Claimed",
              closed: "Claim window closed",
              open: "Open",
            }[status.kind]
          }
        />
        <Stat label="Claim window ends" value={formatDate(claimEnd)} />
        <Stat
          label="Distributor"
          value={<span className="font-mono text-sm">{list.distributor}</span>}
        />
        <Stat label="Token" value={<span className="font-mono text-sm">{list.token}</span>} />
        <Stat label="Addresses on the list" value={list.count.toLocaleString("en-US")} />
      </Facts>
      {status.kind === "open" ? (
        <button
          type="button"
          className="btn btn-primary"
          data-testid="claim-submit"
          disabled={busy}
          onClick={() => void claim()}
        >
          {busy ? "Claiming…" : "Claim ARL"}
        </button>
      ) : null}
      <p className="text-xs text-subtle">
        The proof for your address was checked against the distributor&apos;s root before this
        button was shown. The transaction costs only network gas; ARL never asks for a payment, your
        private key or your seed phrase.
      </p>
    </div>
  );
}
