// A JSON-RPC provider that remembers the finished part of `eth_getLogs` scans.
//
// Reading an agent's score scans the evaluators' whole history in 50,000-block ranges, and Base
// adds about 430,000 blocks a day, so a from-scratch scan grows by about 18 requests a day. Blocks
// well behind the chain head never change, so for each log filter the provider keeps one stored
// entry: every log from the scan's first block up to the last finished range. A later scan answers
// those ranges from that one entry and reads only the newest blocks from the RPC. One entry per
// filter (not one per range) matters on Cloudflare, where each cache read and write counts toward
// the subrequests a request may make. The store is the Cache API there (`caches.default`);
// anything with `match` and `put` works, which keeps this testable.

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

interface RawLog {
  blockNumber?: unknown;
}

/** The stored scan of one filter: its logs for blocks [from, to]. */
interface Scan {
  from: bigint | null;
  to: bigint;
  logs: RawLog[];
  /** Finished ranges that arrived before the ones in front of them, by first block. */
  waiting: Map<bigint, { to: bigint; logs: RawLog[] }>;
  /** The lowest first block asked for while nothing is stored: where the scan starts. */
  lowest: bigint | null;
  reading: number;
  unsaved: number;
  saving: Promise<void>;
}

/** Ranges appended before the entry is written again while a scan is still running. */
const SAVE_EVERY = 5;

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

  const scans = new Map<string, Promise<Scan>>();
  function scan(key: string): Promise<Scan> {
    let s = scans.get(key);
    if (!s) {
      s = opts.cache
        .match(key)
        .catch(() => undefined)
        .then((hit) => {
          const fresh: Scan = {
            from: null,
            to: -1n,
            logs: [],
            waiting: new Map(),
            lowest: null,
            reading: 0,
            unsaved: 0,
            saving: Promise.resolve(),
          };
          if (hit === undefined) return fresh;
          try {
            const v = JSON.parse(hit) as { from: string; to: string; logs: RawLog[] };
            return { ...fresh, from: BigInt(v.from), to: BigInt(v.to), logs: v.logs };
          } catch {
            return fresh;
          }
        });
      scans.set(key, s);
    }
    return s;
  }

  function save(key: string, s: Scan): Promise<void> {
    if (s.unsaved === 0 || s.from === null) return s.saving;
    s.unsaved = 0;
    const value = JSON.stringify({ from: s.from.toString(), to: s.to.toString(), logs: s.logs });
    s.saving = s.saving.then(() => opts.cache.put(key, value)).catch(() => undefined);
    return s.saving;
  }

  /** Adds a finished range, and any waiting ranges that now follow on, to the stored scan. */
  function append(s: Scan, from: bigint, to: bigint, logs: RawLog[]) {
    s.waiting.set(from, { to, logs });
    for (;;) {
      const next = s.from === null ? s.lowest : s.to + 1n;
      const part = next === null ? undefined : s.waiting.get(next);
      if (next === null || !part) return;
      s.waiting.delete(next);
      s.from ??= next;
      s.to = part.to;
      s.logs.push(...part.logs);
      s.unsaved += 1;
    }
  }

  return {
    async request({ method, params }: RpcRequest): Promise<unknown> {
      if (method !== "eth_getLogs") return rpc(method, params);
      const filter = (Array.isArray(params) ? params[0] : undefined) as
        Record<string, unknown> | undefined;
      const from = hex(filter?.fromBlock);
      const to = hex(filter?.toBlock);
      // Only explicit block ranges can be stored: "latest" moves.
      if (!filter || from === null || to === null) return rpc(method, params);

      // The filter without its block range names the scan.
      const key = await sha256(
        JSON.stringify({ ...filter, fromBlock: undefined, toBlock: undefined }),
      );
      const s = await scan(key);
      if (s.from !== null && from >= s.from && to <= s.to) {
        return s.logs.filter((l) => {
          const n = hex(l.blockNumber);
          return n !== null && n >= from && n <= to;
        });
      }
      if (s.from === null && (s.lowest === null || from < s.lowest)) s.lowest = from;

      s.reading += 1;
      try {
        const [logs, headBlock] = await Promise.all([rpc(method, params), head()]);
        if (Array.isArray(logs) && headBlock !== null && to + finality <= headBlock) {
          append(s, from, to, logs as RawLog[]);
        }
        return logs;
      } finally {
        s.reading -= 1;
        if (s.reading === 0 || s.unsaved >= SAVE_EVERY) await save(key, s);
      }
    },
  };
}
