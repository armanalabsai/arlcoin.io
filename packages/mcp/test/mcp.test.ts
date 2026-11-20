import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { decodeFunctionData, type Address } from "viem";

import {
  BASE_MAINNET_TASK_DEPLOYMENTS,
  openTaskAbi,
  taskHash,
  parseTask,
} from "../../protocol/src/index.ts";
import { PROTOCOL_VERSIONS, arlTools, handle, handleLine, type ChainReader } from "../src/index.ts";

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
const BLOCK = 40_000_000n;
const NOW = 1_800_000_000n;
const TASK_URI = "https://example.com/task.json";

/** A Base chain at one block holding job 7 as `job` describes. */
function fakeChain(
  job: Record<string, unknown> | null,
  chainId = 8453,
): ChainReader & {
  reads: { functionName: string; blockNumber?: bigint }[];
} {
  const reads: { functionName: string; blockNumber?: bigint }[] = [];
  return {
    reads,
    getChainId: () => Promise.resolve(chainId),
    getBlock: (args) => Promise.resolve({ number: args?.blockNumber ?? BLOCK, timestamp: NOW }),
    readContract: (a) => {
      reads.push({
        functionName: a.functionName,
        ...(a.blockNumber ? { blockNumber: a.blockNumber } : {}),
      });
      if (a.functionName === "getJob") return Promise.resolve(job ?? { id: 0n });
      if (a.functionName === "getConfig") return Promise.resolve({ tier: 1, threshold: 2 });
      if (a.functionName === "outcomesOf") return Promise.resolve([3n, 1n] as const);
      return Promise.resolve({ phase: 1, approvals: 0 });
    },
  };
}

async function call(tools: ReturnType<typeof arlTools>, name: string, args: unknown) {
  const res = await handle(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    tools,
  );
  const result = res?.result as { content: { text: string }[]; isError: boolean };
  const text = result.content[0]?.text ?? "";
  return { isError: result.isError, text, json: () => JSON.parse(text) as Record<string, unknown> };
}

const open = { task, taskUri: TASK_URI, client: CLIENT, provider: PROVIDER, committee: COMMITTEE };

describe("MCP protocol", () => {
  const tools = arlTools({ chain: fakeChain(null) });

  it("initializes with the client's protocol version when supported", async () => {
    const res = await handle(
      { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-03-26" } },
      tools,
    );
    const r = res?.result as { protocolVersion: string; capabilities: unknown };
    assert.equal(r.protocolVersion, "2025-03-26");
    assert.deepEqual(r.capabilities, { tools: { listChanged: false } });
    const newer = await handle(
      { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2099-01-01" } },
      tools,
    );
    assert.equal(
      (newer?.result as { protocolVersion: string }).protocolVersion,
      PROTOCOL_VERSIONS[0],
    );
  });

  it("lists the tools and never answers a notification", async () => {
    const res = await handle({ jsonrpc: "2.0", id: "a", method: "tools/list" }, tools);
    const names = (res?.result as { tools: { name: string }[] }).tools.map((t) => t.name);
    assert.deepEqual(names, [
      "arl_check_task",
      "arl_list_policies",
      "arl_get_job",
      "arl_get_job_audit",
      "arl_get_agent_outcomes",
      "arl_get_agent_score",
      "arl_get_agent",
      "arl_get_trust_graph",
      "arl_check_evidence",
      "arl_prepare_job",
      "arl_prepare_funding",
    ]);
    assert.equal(
      await handle({ jsonrpc: "2.0", method: "notifications/initialized" }, tools),
      null,
    );
  });

  it("answers bad input with JSON-RPC errors instead of crashing", async () => {
    assert.match((await handleLine("{not json", tools)) ?? "", /-32700/);
    assert.match((await handleLine('{"jsonrpc":"1.0","id":3}', tools)) ?? "", /-32600/);
    assert.match(
      (await handleLine('{"jsonrpc":"2.0","id":4,"method":"resources/list"}', tools)) ?? "",
      /-32601/,
    );
    assert.match(
      (await handleLine(
        '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"nope"}}',
        tools,
      )) ?? "",
      /-32602/,
    );
    assert.equal(await handleLine("   ", tools), null);
  });
});

describe("ARL tools", () => {
  it("checks a task and its policy without the chain", async () => {
    const chain = fakeChain(null);
    const r = await call(arlTools({ chain }), "arl_check_task", { task });
    assert.equal(r.isError, false);
    assert.equal(r.json().taskHash, taskHash(parseTask(task)));
    assert.equal(r.json().policyCheck, "ok");
    assert.equal(chain.reads.length, 0);
    const bad = await call(arlTools({ chain }), "arl_check_task", { task: { ...task, title: "" } });
    assert.equal(bad.isError, true);
    assert.match(bad.text, /TaskError/);
  });

  it("lists the built-in policies with hashes", async () => {
    const r = await call(arlTools({ chain: fakeChain(null) }), "arl_list_policies", {});
    const list = JSON.parse(r.text) as { ref: string; hash: string }[];
    assert.deepEqual(
      list.map((p) => p.ref),
      [
        "arl-policy/1:reexec-standard",
        "arl-policy/1:fallback-review",
        "arl-policy/1:model-assisted-review",
        "arl-policy/1:code-tests",
        "arl-policy/1:data-recompute",
        "arl-policy/1:gpu-inference",
        "arl-policy/1:research-sources",
      ],
    );
    for (const p of list) assert.match(p.hash, /^0x[0-9a-f]{64}$/);
  });

  it("reads a job, its configuration and verdict at one named block", async () => {
    const chain = fakeChain({
      id: 7n,
      client: CLIENT,
      provider: PROVIDER,
      evaluator: ARL.evaluator,
      description: "x",
      budget: 5n,
      expiredAt: NOW,
      status: 1,
    });
    const r = await call(arlTools({ chain }), "arl_get_job", { token: "ARL", jobId: "7" });
    const j = r.json();
    assert.equal(j.block, BLOCK.toString());
    assert.equal(j.status, "Funded");
    assert.equal(j.verified, true);
    assert.equal((j.verdict as { phaseName: string }).phaseName, "Configured");
    assert.equal(j.budget, "5");
    assert.ok(chain.reads.every((x) => x.blockNumber === BLOCK));
    const missing = await call(arlTools({ chain: fakeChain(null) }), "arl_get_job", {
      token: "ARL",
      jobId: "8",
    });
    assert.equal(missing.isError, true);
    const wrongChain = await call(arlTools({ chain: fakeChain(null, 1) }), "arl_get_job", {
      token: "ARL",
      jobId: "7",
    });
    assert.match(wrongChain.text, /chain 1/);
  });

  it("reads an agent's verified outcomes from both evaluators at one block", async () => {
    const chain = fakeChain(null);
    const r = await call(arlTools({ chain }), "arl_get_agent_outcomes", { agentId: "42" });
    const j = r.json();
    assert.equal(j.block, BLOCK.toString());
    assert.equal(j.approved, "6");
    assert.equal(j.rejected, "2");
    assert.deepEqual(Object.keys(j.byToken as object), ["ARL", "USDC"]);
    assert.equal(chain.reads.filter((x) => x.functionName === "outcomesOf").length, 2);
    assert.ok(chain.reads.every((x) => x.blockNumber === BLOCK));
    const bad = await call(arlTools({ chain }), "arl_get_agent_outcomes", { agentId: "-1" });
    assert.equal(bad.isError, true);
  });

  it("scores an agent from verified outcomes, and refuses a reader without logs", async () => {
    const ranges: bigint[][] = [];
    const HEAD = 59_600_000n;
    const chain = {
      ...fakeChain(null),
      getBlock: () => Promise.resolve({ number: HEAD, timestamp: NOW }),
      getLogs: (a: { fromBlock: bigint; toBlock: bigint }) => {
        ranges.push([a.fromBlock, a.toBlock]);
        return Promise.resolve([]);
      },
    };
    const r = await call(arlTools({ chain }), "arl_get_agent_score", { agentId: "42" });
    assert.equal(r.isError, false);
    const j = r.json();
    assert.equal(j.version, "arl-reputation/1");
    assert.equal(j.score_bps, null);
    assert.deepEqual(j.outcomes, []);
    // Every log read ends at the block the answer names.
    assert.equal(j.block, HEAD.toString());
    // Two reads per range: the agent's feedback, and the evaluators' and escrows' events.
    assert.equal(ranges.length, 2);
    assert.ok(ranges.every(([, to]) => to === HEAD));
    const audit = await call(arlTools({ chain }), "arl_get_job_audit", {
      token: "ARL",
      jobId: "1",
    });
    assert.equal(audit.isError, false);
    assert.deepEqual(audit.json().entries, []);
    assert.equal(audit.json().block, HEAD.toString());
    const graph = await call(arlTools({ chain }), "arl_get_trust_graph", {});
    assert.equal(graph.isError, false);
    assert.deepEqual(graph.json().agents, []);
    assert.deepEqual(graph.json().edges, []);
    assert.equal(graph.json().block, HEAD.toString());
    const noLogs = await call(arlTools({ chain: fakeChain(null) }), "arl_get_agent_score", {
      agentId: "42",
    });
    assert.equal(noLogs.isError, true);
    assert.match(noLogs.text, /cannot read logs/);
  });

  it("prepares createJob, then funding only for this task's job", async () => {
    const step1 = await call(arlTools({ chain: fakeChain(null) }), "arl_prepare_job", open);
    assert.equal(step1.isError, false);
    const txs = step1.json().transactions as { to: string; data: `0x${string}`; value: string }[];
    assert.equal(txs.length, 1);
    const [tx] = txs;
    assert.ok(tx);
    assert.equal(tx.to, ARL.jobs);
    assert.equal(tx.value, "0");
    const created = decodeFunctionData({ abi: openTaskAbi, data: tx.data });
    assert.equal(created.functionName, "createJob");
    const description = created.args[3];

    const job = {
      id: 7n,
      client: CLIENT,
      provider: PROVIDER,
      evaluator: ARL.evaluator,
      description,
      budget: 0n,
      expiredAt: NOW,
      status: 0,
    };
    const step2 = await call(arlTools({ chain: fakeChain(job) }), "arl_prepare_funding", {
      ...open,
      jobId: "7",
    });
    assert.equal(step2.isError, false);
    const steps = (step2.json().transactions as { step: string }[]).map((t) => t.step);
    assert.deepEqual(steps, ["configure", "setBudget", "approve", "fund"]);

    for (const other of [
      { ...job, client: PROVIDER },
      { ...job, provider: CLIENT },
      { ...job, evaluator: ARL.jobs },
      { ...job, description: `${description}x` },
    ]) {
      const r = await call(arlTools({ chain: fakeChain(other) }), "arl_prepare_funding", {
        ...open,
        jobId: "7",
      });
      assert.equal(r.isError, true);
      assert.match(r.text, /not this task's job/);
    }

    // An RPC that has not seen the createJob receipt yet reads an empty job: "does not exist",
    // which the Python SDK's open_task retries, not "not this task's job", which it does not.
    const empty = {
      ...job,
      id: 0n,
      client: "0x0000000000000000000000000000000000000000",
      provider: "0x0000000000000000000000000000000000000000",
      evaluator: "0x0000000000000000000000000000000000000000",
      description: "",
    };
    const lagging = await call(arlTools({ chain: fakeChain(empty) }), "arl_prepare_funding", {
      ...open,
      jobId: "7",
    });
    assert.equal(lagging.isError, true);
    assert.match(lagging.text, /does not exist/);
  });

  it("refuses bad addresses, ids and tokens", async () => {
    const tools = arlTools({ chain: fakeChain(null) });
    assert.match(
      (await call(tools, "arl_prepare_job", { ...open, client: "0x12" })).text,
      /client/,
    );
    assert.match(
      (await call(tools, "arl_get_job", { token: "ETH", jobId: "1" })).text,
      /token must be/,
    );
    assert.match((await call(tools, "arl_get_job", { token: "ARL", jobId: "-1" })).text, /jobId/);
    assert.match(
      (
        await call(tools, "arl_prepare_job", {
          ...open,
          committee: [COMMITTEE[0], ARL.arbiter, COMMITTEE[2]],
        })
      ).text,
      /arbiter/,
    );
  });
});
