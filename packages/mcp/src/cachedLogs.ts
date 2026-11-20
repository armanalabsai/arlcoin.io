// A JSON-RPC provider that remembers finished `eth_getLogs` ranges.
//
// Reading an agent's score scans the evaluators' whole history in 50,000-block ranges, and Base
// adds about 430,000 blocks a day, so a from-scratch scan grows by about 18 requests a day. A
// range that ended well behind the chain head never changes, so its answer is stored once and
// every later request reads only the newest ranges from the RPC. The store is the Cache API on
// Cloudflare (`caches.default`); anything with `match` and `put` works, which keeps this testable.

export interface LogCache {
  match(key: string): Promise<string | undefined>;
  put(key: string, value: string): Promise<void>;
}

export interface CachedLogsOptions {
  url: string;
  cache: LogCache;
  fetch?: typeof fetch;
  /** A range is stored only when it ends at least this many blocks behind the head. */
  finality?: bigint;
  timeoutMs?: number;
}

interface RpcRequest {
  method: string;
  params?: unknown;
}

const hex = (v: unknown): bigint | null =>
  typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v) ? BigInt(v) : null;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** An EIP-1193 style `request` function for viem's `custom` transport. */
export function cachedLogsProvider(opts: CachedLogsOptions) {
  const doFetch = opts.fetch ?? fetch;
  const finality = opts.finality ?? 1_000n;
  let id = 0;

  async function rpc(method: string, params: unknown): Promise<unknown> {
    const res = await doFetch(opts.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params ?? [] }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    if (!res.ok) throw new Error(`RPC HTTP ${String(res.status)}`);
    const body = (await res.json()) as {
      result?: unknown;
      error?: { message?: string; code?: number };
    };
    if (body.error) {
      throw new Error(`${body.error.message ?? "RPC error"} (${String(body.error.code ?? "")})`);
    }
    return body.result;
  }

  // The head is read once per burst of requests: it only decides whether a range may be stored.
  let lastHead: { at: number; block: Promise<bigint | null> } | undefined;
  function head(): Promise<bigint | null> {
    if (!lastHead || Date.now() - lastHead.at > 30_000) {
      lastHead = { at: Date.now(), block: rpc("eth_blockNumber", []).then(hex, () => null) };
    }
    return lastHead.block;
  }

  return {
    async request({ method, params }: RpcRequest): Promise<unknown> {
      if (method !== "eth_getLogs") return rpc(method, params);
      const filter = (Array.isArray(params) ? params[0] : undefined) as
        { fromBlock?: unknown; toBlock?: unknown } | undefined;
      const from = hex(filter?.fromBlock);
      const to = hex(filter?.toBlock);
      // Only explicit block ranges can be stored: "latest" moves.
      if (from === null || to === null) return rpc(method, params);

      const key = await sha256(JSON.stringify(params));
      const hit = await opts.cache.match(key);
      if (hit !== undefined) return JSON.parse(hit) as unknown;

      const [logs, headBlock] = await Promise.all([rpc(method, params), head()]);
      if (headBlock !== null && to + finality <= headBlock) {
        await opts.cache.put(key, JSON.stringify(logs)).catch(() => undefined);
      }
      return logs;
    },
  };
}
