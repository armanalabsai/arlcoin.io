import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cachedLogsProvider, type LogCache } from "../src/cachedLogs.ts";

const WIDE = "https://wide.example";
const NARROW = "https://narrow.example";
const READ = "https://read.example";

function setup(head: bigint, store = new Map<string, string>(), refuseWide = () => false) {
  const cache: LogCache = {
    match: (k) => Promise.resolve(store.get(k)),
    put: (k, v) => {
      store.set(k, v);
      return Promise.resolve();
    },
  };
  /** Every eth_getLogs asked of an endpoint, as "host from-to". */
  const asked: string[] = [];
  const fakeFetch = ((url: string, init: { body: string }) => {
    const { method, params } = JSON.parse(init.body) as {
      method: string;
      params: { fromBlock: string; toBlock: string }[];
    };
    if (method === "eth_blockNumber") {
      return Promise.resolve(Response.json({ result: `0x${head.toString(16)}` }));
    }
    if (method !== "eth_getLogs") return Promise.resolve(Response.json({ result: url }));
    if (params[0]?.toBlock === "latest") return Promise.resolve(Response.json({ result: [] }));
    const from = BigInt(params[0]?.fromBlock ?? "0x0");
    const to = BigInt(params[0]?.toBlock ?? "0x0");
    asked.push(`${new URL(url).host.split(".")[0] ?? ""} ${String(from)}-${String(to)}`);
    if (url === WIDE && refuseWide()) return Promise.resolve(new Response("", { status: 429 }));
    if (url === NARROW && to - from + 1n > 1_000n) {
      return Promise.resolve(Response.json({ error: { code: -32602, message: "too wide" } }));
    }
    // One log at the first and one at the last block of the range asked for.
    return Promise.resolve(
      Response.json({ result: [{ blockNumber: h(from) }, { blockNumber: h(to) }] }),
    );
  }) as unknown as typeof fetch;
  const provider = cachedLogsProvider({
    url: WIDE,
    narrow: { url: NARROW, maxSpan: 1_000n, maxRequests: 3 },
    readUrls: [READ],
    cache,
    fetch: fakeFetch,
    retryMs: 1,
  });
  return { provider, asked, store };
}

const h = (n: bigint) => `0x${n.toString(16)}`;
const logs = (from: bigint, to: bigint, address = "0xabc") => ({
  method: "eth_getLogs",
  params: [{ address, fromBlock: h(from), toBlock: h(to) }],
});
const blocks = (found: unknown) =>
  (found as { blockNumber: string }[]).map((l) => Number(BigInt(l.blockNumber)));

describe("cached log scans", () => {
  it("reads a whole history in wide ranges once, then only what is new", async () => {
    const s = setup(120_000n);
    const first = await s.provider.request(logs(1n, 120_000n));
    assert.deepEqual(s.asked, ["wide 1-50000", "wide 50001-100000", "wide 100001-120000"]);
    assert.deepEqual(blocks(first), [1, 50_000, 50_001, 100_000, 100_001, 120_000]);
    assert.equal(s.store.size, 1);

    // Another request, 500 blocks later: the entry ends 1,000 blocks behind the old head.
    const later = setup(120_500n, s.store);
    const second = await later.provider.request(logs(1n, 120_500n));
    assert.deepEqual(later.asked, ["wide 119001-120500"]);
    assert.deepEqual(blocks(second), [1, 50_000, 50_001, 100_000, 100_001, 119_001, 120_500]);
    // A range that lies inside the entry needs no endpoint at all.
    assert.deepEqual(blocks(await later.provider.request(logs(1n, 60_000n))), [1, 50_000, 50_001]);
    assert.equal(later.asked.length, 1);
  });

  it("reads a small gap from the narrow endpoint when the wide one refuses", async () => {
    const s = setup(120_000n);
    await s.provider.request(logs(1n, 120_000n));
    const later = setup(121_500n, s.store, () => true);
    const found = await later.provider.request(logs(1n, 121_500n));
    assert.deepEqual(later.asked, [
      "wide 119001-121500",
      "narrow 119001-120000",
      "narrow 120001-121000",
      "narrow 121001-121500",
    ]);
    assert.equal(blocks(found).at(-1), 121_500);
  });

  it("keeps the ranges it finished when the wide endpoint cuts a long scan short", async () => {
    let calls = 0;
    const s = setup(500_000n, new Map(), () => ++calls > 2);
    await assert.rejects(() => s.provider.request(logs(1n, 500_000n)), /429/);
    assert.equal(s.store.size, 1);
    // The next request starts after the two ranges that were stored.
    const next = setup(500_000n, s.store);
    await next.provider.request(logs(1n, 500_000n));
    assert.equal(next.asked[0], "wide 100001-150000");
  });

  it("keeps filters apart and never stores a moving range", async () => {
    const s = setup(200_000n);
    await s.provider.request(logs(1n, 150_000n));
    await s.provider.request(logs(1n, 150_000n, "0xdef"));
    assert.equal(s.store.size, 2);
    await s.provider.request({
      method: "eth_getLogs",
      params: [{ address: "0x123", fromBlock: "0x1", toBlock: "latest" }],
    });
    assert.equal(s.store.size, 2);
  });

  it("sends other methods to the read endpoints and surfaces RPC errors", async () => {
    const s = setup(10n);
    assert.equal(await s.provider.request({ method: "eth_chainId" }), READ);
    const failing = cachedLogsProvider({
      url: "https://rpc.example",
      cache: { match: () => Promise.resolve(undefined), put: () => Promise.resolve() },
      retryMs: 1,
      fetch: () =>
        Promise.resolve(
          Response.json({ error: { code: -32701, message: "exceed maximum block range: 50000" } }),
        ),
    });
    await assert.rejects(() => failing.request(logs(1n, 2n)), /exceed maximum block range/);
  });
});
