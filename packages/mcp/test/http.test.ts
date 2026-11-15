import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { Address } from "viem";

import { BASE_MAINNET_TASK_DEPLOYMENTS } from "../../protocol/src/index.ts";
import { MAX_BODY_BYTES, arlTools, handleHttp, type ChainReader } from "../src/index.ts";

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
    getBlockNumber: () => Promise.resolve(100n),
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
    assert.equal(((await r.json()) as unknown[]).length, 3);
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
