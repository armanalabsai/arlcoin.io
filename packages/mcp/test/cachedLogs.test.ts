import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cachedLogsProvider, type LogCache } from "../src/cachedLogs.ts";

function setup(head: bigint, store = new Map<string, string>()) {
  const cache: LogCache = {
    match: (k) => Promise.resolve(store.get(k)),
    put: (k, v) => {
      store.set(k, v);
      return Promise.resolve();
    },
  };
  const calls: string[] = [];
  const puts = { count: 0 };
  const counting: LogCache = {
    match: (k) => cache.match(k),
    put: (k, v) => {
      puts.count += 1;
      return cache.put(k, v);
    },
  };
  const fakeFetch = ((_url: string, init: { body: string }) => {
    const { method, params } = JSON.parse(init.body) as {
      method: string;
      params: { fromBlock: string; toBlock: string }[];
    };
    calls.push(method);
    // One log at the first and one at the last block of the range asked for.
    const result =
      method === "eth_blockNumber"
        ? `0x${head.toString(16)}`
        : method === "eth_getLogs"
          ? [{ blockNumber: params[0]?.fromBlock }, { blockNumber: params[0]?.toBlock }]
          : "0x1";
    return Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result })));
  }) as unknown as typeof fetch;
  const provider = cachedLogsProvider({
    url: "https://rpc.example",
    cache: counting,
    fetch: fakeFetch,
  });
  const reads = () => calls.filter((c) => c === "eth_getLogs").length;
  return { provider, calls, store, puts, reads };
}

const h = (n: bigint) => `0x${n.toString(16)}`;
const logs = (from: bigint, to: bigint, address = "0xabc") => ({
  method: "eth_getLogs",
  params: [{ address, fromBlock: h(from), toBlock: h(to) }],
});

describe("cached log scans", () => {
  it("keeps one entry per filter and answers finished ranges from it", async () => {
    const s = setup(200_000n);
    // The ranges of one scan, asked two at a time as the score read does.
    const [a, b] = await Promise.all([
      s.provider.request(logs(1n, 50_000n)),
      s.provider.request(logs(50_001n, 100_000n)),
    ]);
    const c = await s.provider.request(logs(100_001n, 150_000n));
    await s.provider.request(logs(150_001n, 200_000n)); // reaches the head: never stored
    assert.equal(s.reads(), 4);
    assert.equal(s.store.size, 1);

    // A new provider over the same store (another request) reads only the newest range.
    const later = setup(200_100n, s.store);
    assert.deepEqual(await later.provider.request(logs(1n, 50_000n)), a);
    assert.deepEqual(await later.provider.request(logs(50_001n, 100_000n)), b);
    assert.deepEqual(await later.provider.request(logs(100_001n, 150_000n)), c);
    assert.equal(later.reads(), 0);
    await later.provider.request(logs(150_001n, 200_100n));
    assert.equal(later.reads(), 1);
    assert.equal(later.puts.count, 0);
  });

  it("stores a range only once the ranges before it are stored", async () => {
    const s = setup(500_000n);
    await s.provider.request(logs(1n, 50_000n));
    await s.provider.request(logs(100_001n, 150_000n)); // leaves a gap
    const again = setup(500_000n, s.store);
    await again.provider.request(logs(100_001n, 150_000n));
    assert.equal(again.reads(), 1);
    // The same provider fills the gap, and the range after it joins the entry.
    await s.provider.request(logs(50_001n, 100_000n));
    const filled = setup(500_000n, s.store);
    await filled.provider.request(logs(100_001n, 150_000n));
    assert.equal(filled.reads(), 0);
  });

  it("does not store a range near the head or a moving range, and keeps filters apart", async () => {
    const s = setup(200_000n);
    await s.provider.request(logs(150_001n, 199_500n)); // within 1,000 blocks of the head
    await s.provider.request(logs(150_001n, 199_500n));
    assert.equal(s.reads(), 2);
    assert.equal(s.store.size, 0);
    await s.provider.request({
      method: "eth_getLogs",
      params: [{ fromBlock: "0x1", toBlock: "latest" }],
    });
    assert.equal(s.store.size, 0);
    await s.provider.request(logs(1n, 50_000n));
    await s.provider.request(logs(1n, 50_000n, "0xdef"));
    assert.equal(s.store.size, 2);
    assert.equal(s.reads(), 5);
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
