import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { Address } from "viem";

import { BASE_MAINNET_TASK_DEPLOYMENTS } from "../../protocol/src/index.ts";
import { MAX_BODY_BYTES, arlTools, handleHttp, type ChainReader } from "../src/index.ts";
import { auditToCsv, badgeText, csvCell } from "../src/http.ts";

const vectors = JSON.parse(
  readFileSync(new URL("../../../spec/arl-task/v0.1.0/vectors.json", import.meta.url), "utf8"),
) as { valid: { name: string; task: Record<string, unknown>; taskHash: string }[] };
const reexec = vectors.valid.find((v) => v.name === "reexec-arl");
assert.ok(reexec);

const ARL = BASE_MAINNET_TASK_DEPLOYMENTS.ARL;
const CLIENT: Address = "0x1111111111111111111111111111111111111111";

function chain(fail = false): ChainReader {
  return {
    getChainId: () => (fail ? Promise.reject(new Error("rpc down")) : Promise.resolve(8453)),
    getBlock: () => Promise.resolve({ number: 100n, timestamp: 1_800_000_000n }),
    readContract: (a) =>
      Promise.resolve(
        a.functionName === "getJob"
          ? {
              id: 3n,
              client: CLIENT,
              provider: CLIENT,
              evaluator: ARL.evaluator,
              description: "d",
              budget: 1n,
              expiredAt: 2n,
              status: 0,
            }
          : a.functionName === "outcomesOf"
            ? ([2n, 0n] as const)
            : { phase: 1 },
      ),
  };
}

const api = (path: string, init?: RequestInit, fail = false) =>
  handleHttp(new Request(`https://arlcoin.io${path}`, init), arlTools({ chain: chain(fail) }));

describe("Agent API v1", () => {
  it("serves the policies with CORS and a cache", async () => {
    const r = await api("/api/v1/policies");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    assert.equal(r.headers.get("cache-control"), "public, max-age=3600");
    assert.equal(((await r.json()) as unknown[]).length, 7);
  });

  it("checks a task posted as JSON", async () => {
    const ok = await api("/api/v1/tasks/check", {
      method: "POST",
      body: JSON.stringify({ task: reexec.task }),
    });
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as { taskHash: string }).taskHash, reexec.taskHash);
    const bad = await api("/api/v1/tasks/check", {
      method: "POST",
      body: JSON.stringify({ task: { ...reexec.task, title: "" } }),
    });
    assert.equal(bad.status, 400);
    assert.match(((await bad.json()) as { error: string }).error, /^TaskError/);
  });

  it("reads a job from the path and names the block", async () => {
    const r = await api("/api/v1/jobs/ARL/3");
    assert.equal(r.status, 200);
    const j = (await r.json()) as { block: string; status: string; jobId: string };
    assert.deepEqual([j.block, j.status, j.jobId], ["100", "Open", "3"]);
    assert.equal((await api("/api/v1/jobs/ETH/3")).status, 404);
    assert.equal((await api("/api/v1/jobs/ARL/3", {}, true)).status, 502);
  });

  it("reads an agent's verified outcomes from the path", async () => {
    const r = await api("/api/v1/agents/42/outcomes");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "public, max-age=10");
    const j = (await r.json()) as { agentId: string; approved: string; rejected: string };
    assert.deepEqual([j.agentId, j.approved, j.rejected], ["42", "4", "0"]);
    assert.equal((await api("/api/v1/agents/x/outcomes")).status, 404);
    assert.equal((await api(`/api/v1/agents/${"9".repeat(78)}/outcomes`)).status, 400);
    assert.equal((await api(`/api/v1/jobs/ARL/${"9".repeat(78)}`)).status, 400);
  });

  it("refuses wrong methods, unknown paths, bad and oversized bodies", async () => {
    assert.equal((await api("/api/v1/tasks/check")).status, 405);
    assert.equal((await api("/api/v1/nope")).status, 404);
    assert.equal(
      (await api("/api/v1/tasks/check", { method: "POST", body: "{not json" })).status,
      400,
    );
    assert.equal((await api("/api/v1/tasks/check", { method: "POST", body: "[1]" })).status, 400);
    const big = JSON.stringify({ task: "x".repeat(MAX_BODY_BYTES) });
    assert.equal((await api("/api/v1/tasks/check", { method: "POST", body: big })).status, 413);
    const pre = await api("/api/v1/policies", { method: "OPTIONS" });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
  });
});

describe("agent badge", () => {
  const scoreTool = (outcomes: unknown[], completed: number, fail = false) => [
    {
      name: "arl_get_agent_score",
      description: "",
      inputSchema: {},
      run: () =>
        fail ? Promise.reject(new Error("rpc down")) : Promise.resolve({ outcomes, completed }),
    },
  ];
  const get = (tools: ReturnType<typeof scoreTool>, method = "GET") =>
    handleHttp(new Request("https://arlcoin.io/api/v1/agents/7/badge.svg", { method }), tools);

  it("words the record from counts only", () => {
    assert.equal(badgeText({ outcomes: 0, completed: 0 }), "no verified jobs yet");
    assert.equal(badgeText({ outcomes: 1, completed: 1 }), "1 job, 100% approved");
    assert.equal(badgeText({ outcomes: 42, completed: 41 }), "42 jobs, 98% approved");
  });

  it("serves an SVG with the agent's verified record", async () => {
    const res = await get(scoreTool([{}, {}, {}], 2));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^image\/svg\+xml/);
    assert.equal(res.headers.get("cache-control"), "public, max-age=300");
    const text = await res.text();
    assert.match(text, /^<svg /);
    assert.match(text, /ARL verified: 3 jobs, 67% approved/);
  });

  it("says so when an agent has no verified job, and when the chain cannot be read", async () => {
    assert.match(await (await get(scoreTool([], 0))).text(), /no verified jobs yet/);
    const down = await get(scoreTool([], 0, true));
    assert.equal(down.status, 502);
    assert.equal(down.headers.get("cache-control"), "no-store");
    assert.match(await down.text(), /unavailable/);
    assert.equal((await get(scoreTool([], 0), "POST")).status, 405);
  });
});

describe("audit trail as CSV", () => {
  const entries = [
    {
      at: 1_795_191_666,
      step: "The client opened the job",
      event: "JobCreated",
      contract: "escrow",
      actor: "0x00000000000000000000000000000000000000A1",
      block: 60_000_001n,
      transaction: `0x${"ab".repeat(32)}`,
      detail: { budget: "100" },
    },
  ];
  const auditTool = (fail = false) => [
    {
      name: "arl_get_job_audit",
      description: "",
      inputSchema: {},
      run: () => (fail ? Promise.reject(new Error("rpc down")) : Promise.resolve({ entries })),
    },
  ];

  it("quotes every cell and defuses spreadsheet formulas", () => {
    assert.equal(csvCell("plain"), '"plain"');
    assert.equal(csvCell('a "quoted" word'), '"a ""quoted"" word"');
    assert.equal(csvCell("=SUM(A1)"), `"'=SUM(A1)"`);
    assert.equal(csvCell("-1"), `"'-1"`);
    assert.equal(csvCell("@cmd"), `"'@cmd"`);
  });

  it("writes one row per event under a header", () => {
    const lines = auditToCsv({ entries }).trimEnd().split("\r\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0] ?? "", /^"time_utc","step","event"/);
    assert.match(lines[1] ?? "", /^"2026-11-20T/);
    assert.match(lines[1] ?? "", /"60000001"/);
    assert.match(lines[1] ?? "", /""budget"": ""100""/);
  });

  it("serves the file, and says so when the chain cannot be read", async () => {
    const url = "https://arlcoin.io/api/v1/jobs/ARL/1/audit.csv";
    const ok = await handleHttp(new Request(url), auditTool());
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get("content-type") ?? "", /^text\/csv/);
    assert.match(ok.headers.get("content-disposition") ?? "", /arl-job-ARL-1-audit\.csv/);
    assert.equal((await ok.text()).split("\r\n").length, 3);
    assert.equal((await handleHttp(new Request(url), auditTool(true) as never)).status, 502);
    assert.equal(
      (await handleHttp(new Request(url, { method: "POST" }), auditTool() as never)).status,
      405,
    );
  });
});

describe("a history scan that is catching up", () => {
  it("answers 503 with Retry-After, and 502 for any other failure", async () => {
    const tool = (message: string) => [
      {
        name: "arl_get_agent_score",
        description: "",
        inputSchema: {},
        run: () => Promise.reject(new Error(message)),
      },
    ];
    const url = "https://arlcoin.io/api/v1/agents/1/score";
    const busy = await handleHttp(
      new Request(url),
      tool("An unknown RPC error occurred. Details: the log scan is catching up, try again"),
    );
    assert.equal(busy.status, 503);
    assert.equal(busy.headers.get("retry-after"), "5");
    assert.match(await busy.text(), /ask again/);
    assert.equal((await handleHttp(new Request(url), tool("rpc down") as never)).status, 502);
  });
});
