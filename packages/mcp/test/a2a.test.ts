import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { agentCard, arlTools, handleA2a, type ChainReader } from "../src/index.ts";

const chain: ChainReader = {
  getChainId: () => Promise.resolve(8453),
  getBlockNumber: () => Promise.resolve(100n),
  getBlock: () => Promise.resolve({ number: 100n, timestamp: 1_800_000_000n }),
  readContract: (a) =>
    Promise.resolve(a.functionName === "outcomesOf" ? ([1n, 2n] as const) : { phase: 1 }),
};
const tools = arlTools({ chain });

const send = (body: unknown, method = "POST") =>
  handleA2a(
    new Request("https://arlcoin.io/a2a", {
      method,
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    }),
    tools,
  );

const call = (data: unknown) => ({
  jsonrpc: "2.0",
  id: 7,
  method: "message/send",
  params: { message: { role: "user", messageId: "m1", parts: [{ kind: "data", data }] } },
});

describe("A2A", () => {
  it("publishes an agent card that matches the tools", () => {
    const served = JSON.parse(
      readFileSync(
        new URL("../../../apps/web/public/.well-known/agent-card.json", import.meta.url),
        "utf8",
      ),
    ) as unknown;
    assert.deepEqual(served, agentCard(tools));
    assert.deepEqual(
      agentCard(tools).skills.map((s) => s.id),
      tools.map((t) => t.name),
    );
  });

  it("answers message/send with the tool's result in a data part", async () => {
    const r = await send(call({ skill: "arl_get_agent_outcomes", arguments: { agentId: "42" } }));
    const j = (await r.json()) as {
      id: number;
      result: { kind: string; role: string; parts: { kind: string; data: { approved: string } }[] };
    };
    assert.equal(j.id, 7);
    assert.equal(j.result.kind, "message");
    assert.equal(j.result.role, "agent");
    assert.equal(j.result.parts[0]?.data.approved, "2");
  });

  it("reports tool errors in the message and protocol errors as JSON-RPC errors", async () => {
    const bad = (await (
      await send(call({ skill: "arl_get_agent_outcomes", arguments: { agentId: "x" } }))
    ).json()) as { result: { metadata: { ok: boolean } } };
    assert.equal(bad.result.metadata.ok, false);
    const unknown = (await (await send(call({ skill: "nope" }))).json()) as {
      error: { code: number };
    };
    assert.equal(unknown.error.code, -32602);
    const method = (await (
      await send({ jsonrpc: "2.0", id: 1, method: "tasks/get", params: {} })
    ).json()) as { error: { code: number } };
    assert.equal(method.error.code, -32601);
    assert.equal((await send(null, "GET")).status, 405);
  });
});
