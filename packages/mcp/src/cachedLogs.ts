// A JSON-RPC provider that keeps the finished part of `eth_getLogs` scans and reads only what is new.
//
// The agent score, the trust graph and the audit trail read the evaluators' whole history. Base
// adds about 430,000 blocks a day, and of the public endpoints only one accepts wide log ranges
// (50,000 blocks); it rate-limits requests that come from shared addresses such as Cloudflare's.
// So a scan must not be repeated, and must not depend on that one endpoint for small reads:
//
// - For each log filter the provider keeps one stored entry: every log from the scan's first block
//   up to a block well behind the head (blocks that far back never change). The caller asks for
//   the whole range in one request; the provider answers the stored part from the entry and reads
//   only the blocks after it, then moves the entry forward.
// - The blocks after the entry are read from the wide endpoint. When it refuses they are read from
//   an endpoint with a narrow range limit, a bounded number of requests at a time: a long scan
//   then takes several requests to catch up, and each one stores what it read.
// - Everything that is not `eth_getLogs` goes to the other endpoints, tried in order.
//
// One entry per filter (not one per range) matters on Cloudflare, where each cache read and write
// counts toward the subrequests a request may make. The store is the Cache API there
// (`caches.default`); anything with `match` and `put` works, which keeps this testable.

export interface LogCache {
  match(key: string): Promise<string | undefined>;
  put(key: string, value: string): Promise<void>;
}

export interface CachedLogsOptions {
  /** The endpoint that accepts wide `eth_getLogs` ranges. */
  url: string;
  /** Widest range `url` accepts, in blocks. */
  maxSpan?: bigint;
  /**
   * An endpoint with a narrow range limit, asked when `url` refuses. One `eth_getLogs` request to
   * this provider spends at most `maxRequests` requests of `maxSpan` blocks on it; what they cover
   * is stored, and a scan with more left to read fails with "catching up" and goes on from there
   * on the next request.
   */
  narrow?: { url: string; maxSpan: bigint; maxRequests: number };
  /** Endpoints for every other method, tried in order. Defaults to `url`. */
  readUrls?: readonly string[];
  cache: LogCache;
  /**
   * Stored scans shipped with the deployment, by the same keys and in the same form as the cache
   * holds them (packages/mcp/seed.ts writes the file). A scan with nothing in the cache, or
   * with less than the seed, starts from the seed instead of from its first block.
   */
  seed?: Readonly<Record<string, string>>;
  fetch?: typeof fetch;
  /** Logs are stored only for blocks at least this far behind the head. */
  finality?: bigint;
  timeoutMs?: number;
}

interface RpcRequest {
  method: string;
  params?: unknown;
}

interface RawLog {
  blockNumber?: unknown;
}

/** The stored scan of one filter: its logs for blocks [from, to]. */
interface Scan {
  from: bigint | null;
  to: bigint;
  logs: RawLog[];
  /** Requests for this filter run one after another, so the entry only ever moves forward. */
  queue: Promise<unknown>;
}

/** How long an endpoint that failed is skipped while another one answers. */
const COOL_DOWN_MS = 30_000;

const hex = (v: unknown): bigint | null =>
  typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v) ? BigInt(v) : null;
const toHex = (n: bigint) => `0x${n.toString(16)}`;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** An EIP-1193 style `request` function for viem's `custom` transport. */
export function cachedLogsProvider(opts: CachedLogsOptions) {
  const doFetch = opts.fetch ?? fetch;
  const finality = opts.finality ?? 1_000n;
  const maxSpan = opts.maxSpan ?? 50_000n;
  const readUrls = opts.readUrls && opts.readUrls.length > 0 ? [...opts.readUrls] : [opts.url];
  let id = 0;

  async function ask(url: string, method: string, params: unknown): Promise<unknown> {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params ?? [] }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    if (!res.ok) throw new Error(`RPC HTTP status: ${String(res.status)}`);
    const body = (await res.json()) as {
      result?: unknown;
      error?: { message?: string; code?: number };
    };
    if (body.error) {
      throw new Error(`${body.error.message ?? "RPC error"} (${String(body.error.code ?? "")})`);
    }
    return body.result;
  }

  /** When each read endpoint last failed: it is skipped for a while as long as another answers. */
  const failedAt = new Map<string, number>();
  async function read(method: string, params: unknown): Promise<unknown> {
    const now = Date.now();
    const rested = readUrls.filter((u) => now - (failedAt.get(u) ?? -COOL_DOWN_MS) >= COOL_DOWN_MS);
    let last: unknown;
    for (const url of rested.length > 0 ? rested : readUrls) {
      try {
        return await ask(url, method, params);
      } catch (e) {
        failedAt.set(url, Date.now());
        last = e;
      }
    }
    throw last;
  }

  // The head is read once per burst of requests: it only decides how far the entry may move.
  let lastHead: { at: number; block: Promise<bigint | null> } | undefined;
  function head(): Promise<bigint | null> {
    if (!lastHead || Date.now() - lastHead.at > 30_000) {
      lastHead = { at: Date.now(), block: read("eth_blockNumber", []).then(hex, () => null) };
    }
    return lastHead.block;
  }

  const getLogs = async (url: string, filter: object, from: bigint, to: bigint) =>
    (await ask(url, "eth_getLogs", [
      { ...filter, fromBlock: toHex(from), toBlock: toHex(to) },
    ])) as RawLog[];

  /** Logs of [from, to] in requests of at most `span` blocks, `atOnce` at a time, in block order. */
  async function inSpans(
    url: string,
    filter: object,
    from: bigint,
    to: bigint,
    span: bigint,
    atOnce: number,
  ): Promise<RawLog[]> {
    const spans: [bigint, bigint][] = [];
    for (let start = from; start <= to; start += span) {
      const end = start + span - 1n;
      spans.push([start, end < to ? end : to]);
    }
    const parts = new Array<RawLog[]>(spans.length);
    let next = 0;
    const worker = async () => {
      while (next < spans.length) {
        const i = next++;
        const [a, b] = spans[i] as [bigint, bigint];
        parts[i] = await getLogs(url, filter, a, b);
      }
    };
    await Promise.all(Array.from({ length: Math.min(atOnce, spans.length) }, worker));
    return parts.flat();
  }

  /** When the wide endpoint last refused: it is left alone for a while, the narrow one is asked. */
  let wideFailedAt = -COOL_DOWN_MS;

  /**
   * The logs of [from, upTo] where upTo is as far as could be read: the whole range from the wide
   * endpoint, or, when it refuses, as many blocks from `from` as the narrow endpoint's remaining
   * requests cover. `budget.left` counts those requests down.
   */
  async function fetchNew(
    filter: object,
    from: bigint,
    to: bigint,
    budget: { left: number },
  ): Promise<{ logs: RawLog[]; upTo: bigint }> {
    let refused: unknown;
    if (Date.now() - wideFailedAt >= COOL_DOWN_MS) {
      try {
        return { logs: await inSpans(opts.url, filter, from, to, maxSpan, 1), upTo: to };
      } catch (e) {
        wideFailedAt = Date.now();
        refused = e;
      }
    }
    const narrow = opts.narrow;
    if (!narrow || budget.left <= 0) {
      throw refused instanceof Error
        ? refused
        : new Error("the log scan is catching up, try again");
    }
    // One narrow request after another: this endpoint rate-limits too, so whatever was read
    // before it refuses is kept, and the rest waits for the next request.
    const logs: RawLog[] = [];
    let next = from;
    while (next <= to && budget.left > 0) {
      const end = next + narrow.maxSpan - 1n < to ? next + narrow.maxSpan - 1n : to;
      budget.left -= 1;
      try {
        logs.push(...(await getLogs(narrow.url, filter, next, end)));
      } catch (e) {
        budget.left = 0;
        if (next === from) throw e;
        break;
      }
      next = end + 1n;
    }
    return { logs, upTo: next - 1n };
  }

  const parse = (stored: string | undefined): Pick<Scan, "from" | "to" | "logs"> | null => {
    if (stored === undefined) return null;
    try {
      const v = JSON.parse(stored) as { from: string; to: string; logs: RawLog[] };
      if (!Array.isArray(v.logs)) return null;
      return { from: BigInt(v.from), to: BigInt(v.to), logs: v.logs };
    } catch {
      return null;
    }
  };

  const scans = new Map<string, Promise<Scan>>();
  function scan(key: string): Promise<Scan> {
    let s = scans.get(key);
    if (!s) {
      s = opts.cache
        .match(key)
        .catch(() => undefined)
        .then((hit) => {
          const cached = parse(hit);
          const seeded = parse(opts.seed?.[key]);
          // Whichever reaches further; the seed's logs are copied, the scan appends to its own.
          const best =
            cached && (!seeded || cached.to >= seeded.to)
              ? cached
              : seeded && { ...seeded, logs: [...seeded.logs] };
          return { from: null, to: -1n, logs: [], ...best, queue: Promise.resolve() };
        });
      scans.set(key, s);
    }
    return s;
  }

  const within = (logs: RawLog[], from: bigint, to: bigint) =>
    logs.filter((l) => {
      const n = hex(l.blockNumber);
      return n !== null && n >= from && n <= to;
    });

  async function logsOf(
    key: string,
    s: Scan,
    filter: object,
    from: bigint,
    to: bigint,
  ): Promise<RawLog[]> {
    // The entry starts where the first scan started. A request that starts elsewhere (before the
    // entry, or past its end with a gap) is answered from the endpoint and stored nowhere.
    const start = s.from ?? from;
    const stored = s.from === null ? start - 1n : s.to;
    const budget = { left: opts.narrow?.maxRequests ?? 0 };
    if (from < start || from > stored + 1n) {
      const direct = await fetchNew(filter, from, to, budget);
      if (direct.upTo < to) throw new Error("the range is too wide for the endpoints that answer");
      return direct.logs;
    }
    if (to <= stored) return within(s.logs, from, to);

    // Read what is missing one wide range at a time. Each part that is final joins the entry at
    // once, so a scan that cannot finish in this request still leaves the next one less to read.
    const headBlock = await head();
    const finalTo =
      headBlock === null ? stored : headBlock - finality < to ? headBlock - finality : to;
    const tail: RawLog[] = [];
    let moved = false;
    try {
      for (let cursor = stored + 1n; cursor <= to;) {
        const want = cursor + maxSpan - 1n < to ? cursor + maxSpan - 1n : to;
        const { logs, upTo: end } = await fetchNew(filter, cursor, want, budget);
        const final = end <= finalTo ? end : finalTo;
        if (final >= cursor) {
          s.from = start;
          s.logs.push(...within(logs, cursor, final));
          s.to = final;
          moved = true;
        }
        if (final < end) tail.push(...within(logs, final >= cursor ? final + 1n : cursor, end));
        cursor = end + 1n;
      }
    } finally {
      if (moved) {
        const value = JSON.stringify({
          from: start.toString(),
          to: s.to.toString(),
          logs: s.logs,
        });
        await opts.cache.put(key, value).catch(() => undefined);
      }
    }
    return [...within(s.logs, from, s.to), ...tail];
  }

  return {
    async request({ method, params }: RpcRequest): Promise<unknown> {
      if (method !== "eth_getLogs") return read(method, params);
      const given = (Array.isArray(params) ? params[0] : undefined) as
        Record<string, unknown> | undefined;
      const from = hex(given?.fromBlock);
      const to = hex(given?.toBlock);
      // Only explicit block ranges can be stored: "latest" moves.
      if (!given || from === null || to === null) return ask(opts.url, method, params);

      // The filter without its block range names the scan.
      const filter = Object.fromEntries(
        Object.entries(given).filter(([k]) => k !== "fromBlock" && k !== "toBlock"),
      );
      const key = await sha256(JSON.stringify(filter));
      const s = await scan(key);
      const run = s.queue.then(
        () => logsOf(key, s, filter, from, to),
        () => logsOf(key, s, filter, from, to),
      );
      s.queue = run.catch(() => undefined);
      return run;
    },
  };
}
