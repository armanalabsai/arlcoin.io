import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
} from "viem";

import {
  BASE_MAINNET_TASK_DEPLOYMENTS,
  openTaskAbi,
  parseTask,
  taskHash,
} from "../../protocol/src/index.ts";
import { arlActions, type ArlWalletProvider } from "../src/index.ts";
import { fakeZod, type FakeSchema } from "./fake-zod.ts";

const vectors = JSON.parse(
  readFileSync(new URL("../../../spec/arl-task/v0.1.0/vectors.json", import.meta.url), "utf8"),
) as { valid: { name: string; task: Record<string, unknown> }[] };
const task = vectors.valid.find((v) => v.name === "reexec-arl")?.task;
assert.ok(task);

const ARL = BASE_MAINNET_TASK_DEPLOYMENTS.ARL;
const CLIENT: Address = "0x1111111111111111111111111111111111111111";
const PROVIDER: Address = "0x2222222222222222222222222222222222222222";
const COMMITTEE: Address[] = [
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
  "0x5555555555555555555555555555555555555555",
];
const NOW = 1_800_000_000n;
const JOB_ID = 42n;
const TASK_URI = "https://example.com/task.json";

/**
 * A wallet on a fake Base: createJob emits JobCreated for job 42, and getJob then returns what
 * that createJob asked for, `lag` reads late (an RPC a block behind).
 */
function fakeWallet(opts: { lag?: number; revertStep?: number } = {}) {
  const sent: { to: Address; data: Hex }[] = [];
  let created: { provider: Address; evaluator: Address; description: string } | undefined;
  let lag = opts.lag ?? 0;
  const chain = {
    getChainId: () => Promise.resolve(8453),
    getBlock: (args?: { blockNumber: bigint }) =>
      Promise.resolve({ number: args?.blockNumber ?? 40_000_000n, timestamp: NOW }),
    readContract: (a: { functionName: string }) => {
      if (a.functionName !== "getJob") return Promise.resolve({ phase: 1 });
      if (!created || lag-- > 0) return Promise.resolve({ id: 0n });
      return Promise.resolve({ id: JOB_ID, client: CLIENT, ...created });
    },
  };
  const wallet: ArlWalletProvider = {
    getAddress: () => CLIENT,
    getPublicClient: () => chain,
    sendTransaction: (tx) => {
      sent.push({ to: tx.to, data: tx.data });
      return Promise.resolve<Hex>(`0x${sent.length.toString(16).padStart(64, "0")}`);
    },
    waitForTransactionReceipt: () => {
      const n = sent.length;
      const last = sent[n - 1];
      assert.ok(last);
      if (opts.revertStep === n) return Promise.resolve({ status: "reverted", logs: [] });
      if (n !== 1) return Promise.resolve({ status: "success", logs: [] });
      const call = decodeFunctionData({ abi: openTaskAbi, data: last.data });
      if (call.functionName !== "createJob") throw new Error("the first transaction is createJob");
      const [provider, evaluator, expiredAt, description] = call.args;
      created = { provider, evaluator, description };
      const log = {
        address: last.to,
        topics: encodeEventTopics({
          abi: openTaskAbi,
          eventName: "JobCreated",
          args: { jobId: JOB_ID, client: CLIENT, provider },
        }),
        data: encodeAbiParameters(
          [{ type: "address" }, { type: "uint256" }, { type: "address" }],
          [evaluator, expiredAt, "0x0000000000000000000000000000000000000000"],
        ),
      };
      return Promise.resolve({ status: "success", logs: [log] });
    },
  };
  return { wallet, sent };
}

const actions = arlActions(fakeZod, { retryDelayMs: 1 });
const action = (name: string) => {
  const a = actions.find((x) => x.name === name);
  assert.ok(a, name);
  return a;
};
const args = { task, taskUri: TASK_URI, provider: PROVIDER, committee: COMMITTEE };

describe("AgentKit actions", () => {
  it("are the MCP read tools plus arl_open_task, each taking the wallet provider", () => {
    assert.deepEqual(
      actions.map((a) => a.name),
      ["arl_check_task", "arl_list_policies", "arl_get_job", "arl_check_evidence", "arl_open_task"],
    );
    // AgentKit hands the wallet provider only to an invoke that declares two parameters.
    for (const a of actions) assert.equal(a.invoke.length, 2, a.name);
  });

  it("have zod schemas that accept a valid call and refuse a bad one", () => {
    const schema = action("arl_open_task").schema as FakeSchema;
    assert.equal(schema.safeParse(args).success, true);
    assert.equal(schema.safeParse({ ...args, provider: "nobody" }).success, false);
    assert.equal(schema.safeParse({ ...args, committee: "0x33" }).success, false);
    const get = action("arl_get_job").schema as FakeSchema;
    assert.equal(get.safeParse({ token: "USDC", jobId: "7" }).success, true);
    assert.equal(get.safeParse({ token: "DAI", jobId: "7" }).success, false);
  });

  it("checks a task without sending anything", async () => {
    const { wallet, sent } = fakeWallet();
    const out = JSON.parse(await action("arl_check_task").invoke(wallet, { task })) as {
      taskHash: string;
      policyCheck: string;
    };
    assert.equal(out.taskHash, taskHash(parseTask(task)));
    assert.equal(out.policyCheck, "ok");
    assert.equal(sent.length, 0);
  });

  it("opens a task: createJob, then configure, setBudget, approve and fund for that job", async () => {
    const { wallet, sent } = fakeWallet({ lag: 1 });
    const out = JSON.parse(await action("arl_open_task").invoke(wallet, args)) as {
      jobId: string;
      taskHash: string;
      escrow: string;
      transactions: Record<string, string>;
    };
    assert.equal(out.jobId, "42");
    assert.equal(out.taskHash, taskHash(parseTask(task)));
    assert.equal(out.escrow, ARL.jobs);
    assert.deepEqual(Object.keys(out.transactions), [
      "createJob",
      "configure",
      "setBudget",
      "approve",
      "fund",
    ]);
    assert.deepEqual(
      sent.map((t) => t.to),
      [ARL.jobs, ARL.evaluator, ARL.jobs, ARL.token, ARL.jobs],
    );
    const fund = decodeFunctionData({ abi: openTaskAbi, data: sent[4]?.data ?? "0x" });
    assert.equal(fund.functionName, "fund");
    assert.equal(fund.args[0], JOB_ID);
  });

  it("sends nothing for a task its policy refuses", async () => {
    const { wallet, sent } = fakeWallet();
    await assert.rejects(
      action("arl_open_task").invoke(wallet, { ...args, task: { ...task, title: "" } }),
    );
    await assert.rejects(
      action("arl_open_task").invoke(wallet, { ...args, committee: COMMITTEE.slice(0, 1) }),
    );
    assert.equal(sent.length, 0);
  });

  it("stops at a reverted transaction", async () => {
    const { wallet, sent } = fakeWallet({ revertStep: 3 });
    await assert.rejects(action("arl_open_task").invoke(wallet, args), /setBudget reverted/);
    assert.equal(sent.length, 3);
  });
});
