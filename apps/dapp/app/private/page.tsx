"use client";

import {
  commitment,
  createGroup,
  identityMessage,
  proveSignal,
  secretFromSignature,
  signalInputs,
} from "@arl/zk";
import circuitJson from "@arl/zk/circuit";
import type { CompiledCircuit } from "@noir-lang/noir_js";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createWalletClient, http } from "viem";
import { usePublicClient, useSignMessage } from "wagmi";

import { Facts, PageTitle, RequireWallet, Stat } from "~~/components/arl/ui";
import deployedContracts from "~~/contracts/deployedContracts";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import {
  DEMO_GROUP,
  DEMO_GROUP_ADMIN,
  DEMO_RELAYER,
  POLL,
  optionMessage,
  tally,
} from "~~/lib/poll";

const SIGNAL = deployedContracts[31337].ARLAnonymousSignal;
const circuit = circuitJson as unknown as CompiledCircuit;

type Status =
  | { kind: "idle" }
  | { kind: "busy"; text: string }
  | { kind: "done"; text: string }
  | { kind: "error"; text: string };

export default function PrivatePage() {
  return (
    <>
      <PageTitle title="Private">
        Vote as a member of a group without revealing which member you are. Your browser proves
        membership with a zero-knowledge proof; the contract checks the proof and accepts one vote
        per member per poll.
      </PageTitle>
      <RequireWallet>
        <Private />
      </RequireWallet>
    </>
  );
}

/** Group members from MembersAdded events, in order, and the root they must produce. */
function useGroup() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["arl-group", client?.chain.id],
    enabled: !!client,
    refetchInterval: 3_000,
    queryFn: async () => {
      if (!client) throw new Error("no client");
      const [events, root, votes] = await Promise.all([
        client.getContractEvents({
          address: SIGNAL.address,
          abi: SIGNAL.abi,
          eventName: "MembersAdded",
          args: { groupId: DEMO_GROUP },
          fromBlock: 0n,
        }),
        client.readContract({
          address: SIGNAL.address,
          abi: SIGNAL.abi,
          functionName: "groupRoot",
          args: [DEMO_GROUP],
        }),
        client.getContractEvents({
          address: SIGNAL.address,
          abi: SIGNAL.abi,
          eventName: "Signal",
          args: { groupId: DEMO_GROUP },
          fromBlock: 0n,
        }),
      ]);
      const members = events.flatMap((e) => [...(e.args.commitments ?? [])]);
      const group = createGroup(members);
      return {
        members,
        group,
        root,
        // The published list must rebuild exactly the root the contract holds.
        consistent: members.length > 0 && group.root === root,
        counts: tally(
          votes.map((v) => ({ scope: v.args.scope ?? 0n, message: v.args.message ?? 0n })),
        ),
      };
    },
  });
}

function Private() {
  const { targetNetwork } = useTargetNetwork();
  const client = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const { data: g, refetch } = useGroup();
  const [secret, setSecret] = useState<bigint>();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const mine = secret !== undefined ? commitment(secret) : undefined;
  const member = mine !== undefined && !!g?.members.includes(mine);
  const busy = status.kind === "busy";

  // Local demo roles: Anvil development accounts that the local node unlocks (no keys).
  const localWallet = (account: `0x${string}`) =>
    createWalletClient({
      account,
      chain: targetNetwork,
      transport: http(targetNetwork.rpcUrls.default.http[0]),
    });

  const createIdentity = async () => {
    try {
      const signature = await signMessageAsync({
        message: identityMessage(`eip155:${String(targetNetwork.id)}`),
      });
      setSecret(secretFromSignature(signature));
      setStatus({ kind: "idle" });
    } catch {
      setStatus({ kind: "error", text: "The signature was not given." });
    }
  };

  const join = async () => {
    if (mine === undefined || !g || !client) return;
    setStatus({ kind: "busy", text: "Adding you to the group" });
    try {
      const next = createGroup([...g.members, mine]);
      const hash = await localWallet(DEMO_GROUP_ADMIN).writeContract({
        address: SIGNAL.address,
        abi: SIGNAL.abi,
        functionName: "addMembers",
        args: [DEMO_GROUP, [mine], next.root],
      });
      await client.waitForTransactionReceipt({ hash });
      await refetch();
      setStatus({
        kind: "done",
        text: "You are a member. Only your public commitment was published.",
      });
    } catch (e) {
      setStatus({
        kind: "error",
        text: e instanceof Error ? e.message.split("\n")[0]! : "Could not join",
      });
    }
  };

  const vote = async (option: number) => {
    if (secret === undefined || !g || !client) return;
    if (!g.consistent)
      return setStatus({
        kind: "error",
        text: "The published member list does not match the root.",
      });
    try {
      setStatus({ kind: "busy", text: "Proving membership in your browser" });
      const inputs = signalInputs(secret, g.group, POLL.scope, optionMessage(option));
      const used = await client.readContract({
        address: SIGNAL.address,
        abi: SIGNAL.abi,
        functionName: "isNullifierUsed",
        args: [DEMO_GROUP, inputs.nullifier],
      });
      if (used) return setStatus({ kind: "error", text: "You have already voted in this poll." });
      const proof = await proveSignal(circuit, inputs);
      setStatus({ kind: "busy", text: "Submitting through the relayer" });
      const hash = await localWallet(DEMO_RELAYER).writeContract({
        address: SIGNAL.address,
        abi: SIGNAL.abi,
        functionName: "signal",
        args: [DEMO_GROUP, proof.scope, proof.message, proof.root, proof.nullifier, proof.proof],
      });
      await client.waitForTransactionReceipt({ hash });
      await refetch();
      setStatus({
        kind: "done",
        text: "Your vote was counted. Nothing on-chain links it to your wallet.",
      });
    } catch (e) {
      setStatus({
        kind: "error",
        text: e instanceof Error ? e.message.split("\n")[0]! : "Voting failed",
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="glass-strong flex flex-col gap-3 p-5" aria-labelledby="identity-heading">
        <h2 id="identity-heading" className="text-sm font-extrabold">
          1 · Your private identity
        </h2>
        <p className="text-sm text-muted">
          Your wallet signs a fixed message; the identity secret is derived from that signature in
          this page and is never stored or sent. Signing again later gives the same identity. Only
          its public commitment is ever shared.
        </p>
        {secret === undefined ? (
          <button
            type="button"
            className="btn btn-primary self-start"
            onClick={() => void createIdentity()}
            data-testid="zk-identity"
          >
            Create my identity
          </button>
        ) : (
          <Facts inset>
            <Stat
              label="Public commitment"
              value={<span className="font-mono text-xs">{mine?.toString().slice(0, 18)}…</span>}
              testId="zk-commitment"
            />
            <Stat
              label="Group membership"
              value={member ? "Member" : "Not a member yet"}
              testId="zk-member"
            />
          </Facts>
        )}
        {secret !== undefined && !member ? (
          <button
            type="button"
            className="btn btn-glass self-start"
            disabled={busy || !g}
            onClick={() => void join()}
            data-testid="zk-join"
          >
            Join the demo group
          </button>
        ) : null}
      </section>

      <section className="glass-strong flex flex-col gap-3 p-5" aria-labelledby="poll-heading">
        <h2 id="poll-heading" className="text-sm font-extrabold">
          2 · {POLL.question}
        </h2>
        <p className="text-sm text-muted">
          One vote per member. The vote is sent by a relayer, so the sender is not your wallet
          either.
        </p>
        <ul
          className="divide-y divide-white/8 rounded-xl border border-white/10"
          data-testid="zk-results"
        >
          {POLL.options.map((label, i) => (
            <li key={label} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm">{label}</span>
              <span className="flex items-center gap-3">
                <span className="stat-value-arl text-sm" data-testid={`zk-count-${String(i)}`}>
                  {g?.counts[i] ?? 0}
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!member || busy}
                  onClick={() => void vote(i)}
                  data-testid={`zk-vote-${String(i)}`}
                >
                  Vote
                </button>
              </span>
            </li>
          ))}
        </ul>
        <Facts inset>
          <Stat label="Members" value={g ? g.members.length : "…"} testId="zk-members" />
          <Stat
            label="Member list"
            value={
              <span className="text-sm font-normal">
                {g ? (g.consistent ? "matches the on-chain root" : "does not match the root") : "…"}
              </span>
            }
          />
        </Facts>
      </section>

      {status.kind !== "idle" ? (
        <p
          className={`glass-chip px-4 py-3 text-sm ${status.kind === "error" ? "text-error" : ""}`}
          role="status"
          data-testid="zk-status"
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
