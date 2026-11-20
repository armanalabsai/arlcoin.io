import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cachedLogsProvider, type LogCache } from "../src/cachedLogs.ts";

function setup(head: bigint) {
  const store = new Map<string, string>();
  const cache: LogCache = {
    match: (k) => Promise.resolve(store.get(k)),
    put: (k, v) => {
      store.set(k, v);
      return Promise.resolve();
    },
  };
  const calls: string[] = [];
  const fakeFetch = ((_url: string, init: { body: string }) => {
    const { method, params } = JSON.parse(init.body) as { method: string; params: unknown[] };
    calls.push(method);
    const result =
      method === "eth_blockNumber"
        ? `0x${head.toString(16)}`
        : method === "eth_getLogs"
          ? [{ range: params[0] }]
          : "0x1";
    return Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result })));
  }) as unknown as typeof fetch;
  const provider = cachedLogsProvider({ url: "https://rpc.example", cache, fetch: fakeFetch });
  return { provider, calls, store };
}

const logs = (from: bigint, to: bigint) => ({
  method: "eth_getLogs",
  params: [
    { address: "0xabc", fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` },
  ],
});

describe("cached log ranges", () => {
  it("stores a finished range and answers it without the RPC next time", async () => {
    const s = setup(200_000n);
    const first = await s.provider.request(logs(1n, 50_000n));
    const again = await s.provider.request(logs(1n, 50_000n));
    assert.deepEqual(again, first);
    assert.deepEqual(s.calls.filter((c) => c === "eth_getLogs").length, 1);
  });

  it("does not store a range near the head, a different filter, or a moving range", async () => {
    const s = setup(200_000n);
    await s.provider.request(logs(150_001n, 199_500n)); // within 1,000 blocks of the head
    await s.provider.request(logs(150_001n, 199_500n));
    assert.equal(s.calls.filter((c) => c === "eth_getLogs").length, 2);
    assert.equal(s.store.size, 0);
    await s.provider.request({
      method: "eth_getLogs",
      params: [{ fromBlock: "0x1", toBlock: "latest" }],
    });
    assert.equal(s.store.size, 0);
    await s.provider.request(logs(1n, 50_000n));
    await s.provider.request({
      method: "eth_getLogs",
      params: [{ address: "0xdef", fromBlock: "0x1", toBlock: "0xc350" }],
    });
    assert.equal(s.store.size, 2);
  });

  it("passes other methods through and surfaces RPC errors", async () => {
    const s = setup(10n);
    assert.equal(await s.provider.request({ method: "eth_chainId" }), "0x1");
    const failing = cachedLogsProvider({
      url: "https://rpc.example",
      cache: { match: () => Promise.resolve(undefined), put: () => Promise.resolve() },
      fetch: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: -32701, message: "exceed maximum block range: 50000" },
            }),
          ),
        ),
    });
    await assert.rejects(() => failing.request(logs(1n, 2n)), /exceed maximum block range/);
  });
});
