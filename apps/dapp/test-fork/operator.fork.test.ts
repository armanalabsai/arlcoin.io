// End to end on a local fork of Base Sepolia, through the app's own server (next start) and its
// testnet operator API, as a visitor would use it: faucet, staking, the jobs escrow, joining the
// demo poll group, an anonymous vote proved in this process and relayed, and an x402 `upto`
// payment settled by the operator. Run by scripts/rehearse-sepolia-app.sh, which starts the fork,
// deploys the ecosystem, builds the app for Base Sepolia and starts it.
//
// Environment: ARL_APP_URL, ARL_FORK_RPC, ARL_SEPOLIA_RECORD.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, describe, it } from "node:test";

import {
  commitment,
  createGroup,
  identityMessage,
  proveSignal,
  secretFromSignature,
  signalInputs,
} from "@arl/zk";
import type { CompiledCircuit } from "@noir-lang/noir_js";
import type { PaymentRequirements, SettleResponse } from "@x402/core/types";
import { UptoEvmScheme, toClientEvmSigner } from "@x402/evm";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  publicActions,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { FAUCET_AMOUNT, joinMessage } from "../lib/operatorRules.ts";
import { PERMIT2, uptoRequirements } from "../lib/payments.ts";
import { DEMO_GROUP, POLL } from "../lib/poll.ts";

const loadCircuit = () =>
  JSON.parse(
    readFileSync(createRequire(import.meta.url).resolve("@arl/zk/circuit"), "utf8"),
  ) as CompiledCircuit;

const APP = process.env.ARL_APP_URL ?? "http://127.0.0.1:3219";
const RPC = process.env.ARL_FORK_RPC ?? "http://127.0.0.1:18770";
const record = JSON.parse(readFileSync(process.env.ARL_SEPOLIA_RECORD ?? "", "utf8")) as {
  operator: Address;
  contracts: Record<
    "ARLToken" | "ARLStakingRewards" | "ARLJobs" | "ARLAnonymousSignal",
    { address: Address }
  >;
};
const TOKEN = record.contracts.ARLToken.address;
const STAKING = record.contracts.ARLStakingRewards.address;
const JOBS = record.contracts.ARLJobs.address;
const SIGNAL = record.contracts.ARLAnonymousSignal.address;

const chain = { ...baseSepolia, rpcUrls: { default: { http: [RPC] } } };
const reader = createPublicClient({ chain, transport: http(RPC) });
const user = privateKeyToAccount(generatePrivateKey());
const provider = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ account: user, chain, transport: http(RPC) }).extend(
  publicActions,
);
const providerWallet = createWalletClient({
  account: provider,
  chain,
  transport: http(RPC),
}).extend(publicActions);

const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
const stakingAbi = parseAbi([
  "function stake(uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
  "function earned(address) view returns (uint256)",
]);
const jobsAbi = parseAbi([
  "function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256)",
  "function setBudget(uint256 jobId, uint256 amount, bytes optParams)",
  "function fund(uint256 jobId, uint256 expectedBudget, bytes optParams)",
  "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
  "function complete(uint256 jobId, bytes32 reason, bytes optParams)",
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
]);
const signalAbi = parseAbi([
  "event MembersAdded(uint256 indexed groupId, uint256[] commitments)",
  "function groupRoot(uint256 groupId) view returns (uint256)",
  "function isNullifierUsed(uint256 groupId, uint256 nullifier) view returns (bool)",
]);

const arl = (a: Address) =>
  reader.readContract({ address: TOKEN, abi: erc20, functionName: "balanceOf", args: [a] });
async function send(hash: Promise<Hex>) {
  const r = await reader.waitForTransactionReceipt({ hash: await hash });
  assert.equal(r.status, "success");
  return r;
}
async function api<T>(
  action: string,
  body?: unknown,
): Promise<{ status: number; data: T & { error?: string } }> {
  const res = await fetch(`${APP}/api/operator/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)),
  });
  return { status: res.status, data: (await res.json()) as T & { error?: string } };
}

describe("ARL on Base Sepolia (fork), through the app's operator", { timeout: 600_000 }, () => {
  before(async () => {
    for (const a of [user.address, provider.address])
      await reader.request({
        method: "anvil_setBalance" as never,
        params: [a, "0x16345785D8A0000"] as never,
      });
  });

  it("reports the operator", async () => {
    const { status, data } = await api<{ operator: Address; chainId: number }>("status");
    assert.equal(status, 200);
    assert.equal(data.operator, record.operator);
    assert.equal(data.chainId, 84_532);
  });

  it("pays 1,000 testnet ARL once, then refuses", async () => {
    const first = await api<{ transaction: Hex }>("faucet", { account: user.address });
    assert.equal(first.status, 200, first.data.error);
    assert.equal(await arl(user.address), FAUCET_AMOUNT);
    const again = await api("faucet", { account: user.address });
    assert.equal(again.status, 429);
    const bad = await api("faucet", { account: "0x1234" });
    assert.equal(bad.status, 400);
  });

  it("stakes into the funded reward period", async () => {
    await send(
      wallet.writeContract({
        address: TOKEN,
        abi: erc20,
        functionName: "approve",
        args: [STAKING, 100n * 10n ** 18n],
      }),
    );
    await send(
      wallet.writeContract({
        address: STAKING,
        abi: stakingAbi,
        functionName: "stake",
        args: [100n * 10n ** 18n],
      }),
    );
    await reader.request({ method: "evm_increaseTime" as never, params: [60] as never });
    await reader.request({ method: "evm_mine" as never, params: [] as never });
    assert.equal(
      await reader.readContract({
        address: STAKING,
        abi: stakingAbi,
        functionName: "balanceOf",
        args: [user.address],
      }),
      100n * 10n ** 18n,
    );
    assert.ok(
      (await reader.readContract({
        address: STAKING,
        abi: stakingAbi,
        functionName: "earned",
        args: [user.address],
      })) > 0n,
    );
  });

  it("runs a job through escrow: create, fund, deliver, accept, pay", async () => {
    const latest = await reader.getBlock();
    const created = await send(
      wallet.writeContract({
        address: JOBS,
        abi: jobsAbi,
        functionName: "createJob",
        args: [
          provider.address,
          user.address,
          latest.timestamp + 7n * 86_400n,
          "Summarise a paper",
          "0x0000000000000000000000000000000000000000",
        ],
      }),
    );
    const log = created.logs.find((l) => l.address.toLowerCase() === JOBS.toLowerCase());
    const jobId = BigInt(log?.topics[1] ?? "0x0");
    const budget = 50n * 10n ** 18n;
    await send(
      wallet.writeContract({
        address: JOBS,
        abi: jobsAbi,
        functionName: "setBudget",
        args: [jobId, budget, "0x"],
      }),
    );
    await send(
      wallet.writeContract({
        address: TOKEN,
        abi: erc20,
        functionName: "approve",
        args: [JOBS, budget],
      }),
    );
    await send(
      wallet.writeContract({
        address: JOBS,
        abi: jobsAbi,
        functionName: "fund",
        args: [jobId, budget, "0x"],
      }),
    );
    await send(
      providerWallet.writeContract({
        address: JOBS,
        abi: jobsAbi,
        functionName: "submit",
        args: [jobId, `0x${"11".repeat(32)}`, "0x"],
      }),
    );
    await send(
      wallet.writeContract({
        address: JOBS,
        abi: jobsAbi,
        functionName: "complete",
        args: [jobId, `0x${"00".repeat(32)}`, "0x"],
      }),
    );
    assert.equal(await arl(provider.address), budget);
  });

  it("joins the demo group with a signed request and votes anonymously through the relayer", async () => {
    const secret = secretFromSignature(
      await wallet.signMessage({ message: identityMessage("eip155:84532") }),
    );
    const mine = commitment(secret);
    const signature = await wallet.signMessage({ message: joinMessage(mine, 84_532) });

    const forged = await api("join", { account: provider.address, commitment: mine, signature });
    assert.equal(forged.status, 401);
    const joined = await api<{ member: boolean }>("join", {
      account: user.address,
      commitment: mine,
      signature,
    });
    assert.equal(joined.status, 200, joined.data.error);
    assert.equal(joined.data.member, true);

    const events = await reader.getContractEvents({
      address: SIGNAL,
      abi: signalAbi,
      eventName: "MembersAdded",
      fromBlock: 0n,
    });
    const members = events.flatMap((e) => [...(e.args.commitments ?? [])]);
    const group = createGroup(members);
    assert.equal(
      await reader.readContract({
        address: SIGNAL,
        abi: signalAbi,
        functionName: "groupRoot",
        args: [DEMO_GROUP],
      }),
      group.root,
    );

    const proof = await proveSignal(loadCircuit(), signalInputs(secret, group, POLL.scope, 2n));
    const relayed = await api<{ transaction: Hex }>("relay", {
      scope: proof.scope,
      message: proof.message,
      root: proof.root,
      nullifier: proof.nullifier,
      proof: proof.proof,
    });
    assert.equal(relayed.status, 200, relayed.data.error);
    const tx = await reader.getTransaction({ hash: relayed.data.transaction });
    assert.equal(
      tx.from.toLowerCase(),
      record.operator.toLowerCase(),
      "the vote is sent by the operator",
    );
    assert.equal(
      await reader.readContract({
        address: SIGNAL,
        abi: signalAbi,
        functionName: "isNullifierUsed",
        args: [DEMO_GROUP, proof.nullifier],
      }),
      true,
    );

    const twice = await api("relay", {
      scope: proof.scope,
      message: proof.message,
      root: proof.root,
      nullifier: proof.nullifier,
      proof: proof.proof,
    });
    assert.equal(
      twice.status,
      400,
      "a second vote with the same nullifier is refused before sending",
    );
  });

  it("settles a metered x402 upto payment to the demo service, capped by the ceiling", async () => {
    await send(
      wallet.writeContract({
        address: TOKEN,
        abi: erc20,
        functionName: "approve",
        args: [PERMIT2, 10n * 10n ** 18n],
      }),
    );
    const requirements: PaymentRequirements = uptoRequirements({
      chainId: 84_532,
      arl: TOKEN,
      ceiling: 5n * 10n ** 18n,
      payTo: record.operator,
      facilitator: record.operator,
      windowSeconds: 300,
    });
    const client = new UptoEvmScheme(toClientEvmSigner(user, reader));
    const signed = await client.createPaymentPayload(2, requirements);
    const payload = { x402Version: 2, accepted: requirements, payload: signed.payload };
    const before = await arl(record.operator);

    const tooMuch = await api("settle", { payload, requirements, amount: 6n * 10n ** 18n });
    assert.equal(tooMuch.status, 400);
    const foreign = await api("settle", {
      payload,
      requirements: { ...requirements, payTo: provider.address },
      amount: 1n,
    });
    assert.equal(foreign.status, 403);

    const charge = 1_234n * 10n ** 15n;
    const settled = await api<SettleResponse>("settle", { payload, requirements, amount: charge });
    assert.equal(settled.status, 200, settled.data.error);
    assert.equal(settled.data.success, true, settled.data.errorReason);
    assert.equal((await arl(record.operator)) - before, charge);
    const replay = await api<SettleResponse>("settle", { payload, requirements, amount: charge });
    assert.ok(
      replay.status !== 200 || replay.data.success === false,
      "one authorization settles once",
    );
  });
});
