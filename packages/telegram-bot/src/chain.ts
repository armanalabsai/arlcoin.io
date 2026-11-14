// Read-only Base Mainnet figures: total ARL staked and the staking reward window (/status), and
// the circulating supply (/supply).
//
// Everything comes from public eth_call reads on Base Mainnet. Nothing is signed or sent. Several
// public endpoints are asked at once and the first complete answer wins, because a single
// endpoint can refuse or rate-limit the Worker's network. Results are cached so a busy group
// cannot hammer the RPCs.

export const RPC_URLS = [
  "https://mainnet.base.org",
  "https://base-rpc.publicnode.com",
  "https://base.drpc.org",
  "https://base-mainnet.public.blastapi.io",
];
export const STAKING = "0x15e257009BE9B1875fbfa69D291320aaFE3fa102";
export const TOKEN = "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4";
export const TOTAL_SUPPLY_SELECTOR = "0x18160ddd"; // totalSupply()
export const PERIOD_FINISH_SELECTOR = "0xebe2b12b"; // periodFinish()
export const BALANCE_OF_SELECTOR = "0x70a08231"; // balanceOf(address)
/**
 * Protocol-controlled and locked addresses excluded from the circulating supply: the same list as
 * apps/web/api/supply-config.json (a test keeps them equal).
 */
export const SUPPLY_LOCKED = [
  "0x42A0E39399aAd8e088f9561ceC1512EA93D18E05",
  "0xfF12597A671ebAF0cAe37999EE659e03c4f444B5",
  "0x90D8c082e9AdABE96804Ae9c6117Fd5b245F4cb1",
  "0x8894C0bc9A83Aa497Cf35618b72100dCa459C1AC",
  "0xe5C7F7BDd59286C9baE7FfE85F3CF99382F8989D",
  "0xdBa5CfeD6E6076DabAbb4a6D851605cC5C8bb47D",
  "0xA1B52BA110A2738E5769dE3F9d0BE70E1b0604A3",
  "0x8E2CC3a5F39038836475650f63A91d107BabA643",
  "0x36C94925c2BAB7897A000c57CE5536F5Bc60a95B",
  "0xF3820BC1510a9A1B9aa2b318Dd997127f198B1c2",
  "0x4d9be214f71b391574a3A8dbE145AeF142eB0c13",
  "0xB521d1E4eF0dA060e3B6C5d8667DE711abc4D120",
] as const;
const CACHE_MS = 60_000;
const SUPPLY_CACHE_MS = 300_000;
// A failed read is retried after 30 seconds, not kept for the full cache time.
const FAILURE_CACHE_MS = 30_000;
const TIMEOUT_MS = 8_000;
const WEI = 10n ** 18n;
const MAX_SUPPLY = 21_000_000n * WEI;

export interface Status {
  /** Whole ARL staked, null if unknown. */
  totalStaked: number | null;
  /** Unix seconds, 0 if never started, null if unknown. */
  rewardPeriodFinish: number | null;
}

export function parseUint(result: unknown): number | null {
  if (typeof result !== "string" || !/^0x[0-9a-fA-F]+$/.test(result)) return null;
  return Number(BigInt(result));
}

export function parseArl(result: unknown): number | null {
  if (typeof result !== "string" || !/^0x[0-9a-fA-F]+$/.test(result)) return null;
  return Number(BigInt(result) / WEI);
}

export type Fetch = typeof fetch;

export interface Call {
  to: string;
  data: string;
}

const word = (address: string) => address.toLowerCase().replace(/^0x/, "").padStart(64, "0");

/** The results of `calls` from one endpoint, as hex strings, or a thrown error. */
async function batchFrom(fetchFn: Fetch, url: string, calls: readonly Call[]): Promise<string[]> {
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      calls.map((c, id) => ({
        jsonrpc: "2.0",
        id,
        method: "eth_call",
        params: [{ to: c.to, data: c.data }, "latest"],
      })),
    ),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`rpc ${String(res.status)}`);
  const out = (await res.json()) as unknown;
  if (!Array.isArray(out)) throw new Error("rpc: not a batch");
  return calls.map((_, id) => {
    const r = (out as { id?: number; result?: unknown }[]).find((x) => x.id === id);
    if (typeof r?.result !== "string" || !/^0x[0-9a-fA-F]+$/.test(r.result))
      throw new Error("rpc: call failed");
    return r.result;
  });
}

/** Every endpoint at once; the first complete answer wins. Null when all of them fail. */
export async function readCalls(fetchFn: Fetch, calls: readonly Call[]): Promise<string[] | null> {
  try {
    return await Promise.any(RPC_URLS.map((url) => batchFrom(fetchFn, url, calls)));
  } catch {
    return null;
  }
}

export class StatusReader {
  private cached: { at: number; status: Status } | null = null;
  private readonly fetchFn: Fetch;
  constructor(fetchFn: Fetch = fetch) {
    this.fetchFn = fetchFn;
  }

  async read(): Promise<Status> {
    const failed = this.cached?.status.totalStaked === null;
    const ttl = failed ? FAILURE_CACHE_MS : CACHE_MS;
    if (this.cached && Date.now() - this.cached.at < ttl) return this.cached.status;
    const out = await readCalls(this.fetchFn, [
      { to: STAKING, data: TOTAL_SUPPLY_SELECTOR },
      { to: STAKING, data: PERIOD_FINISH_SELECTOR },
    ]);
    const status = {
      totalStaked: parseArl(out?.[0]),
      rewardPeriodFinish: parseUint(out?.[1]),
    };
    this.cached = { at: Date.now(), status };
    return status;
  }
}

/** Circulating ARL: total supply minus the balances of SUPPLY_LOCKED, in whole ARL, cached. */
export class SupplyReader {
  private cached: { at: number; value: number | null } | null = null;
  private readonly fetchFn: Fetch;
  constructor(fetchFn: Fetch = fetch) {
    this.fetchFn = fetchFn;
  }

  async read(): Promise<number | null> {
    const ttl = this.cached?.value === null ? FAILURE_CACHE_MS : SUPPLY_CACHE_MS;
    if (this.cached && Date.now() - this.cached.at < ttl) return this.cached.value;
    const out = await readCalls(this.fetchFn, [
      { to: TOKEN, data: TOTAL_SUPPLY_SELECTOR },
      ...SUPPLY_LOCKED.map((a) => ({ to: TOKEN, data: BALANCE_OF_SELECTOR + word(a) })),
    ]);
    let value: number | null = null;
    if (out) {
      const [total, ...balances] = out.map((h) => BigInt(h));
      const locked = balances.reduce((s, b) => s + b, 0n);
      if (total !== undefined && total <= MAX_SUPPLY && locked <= total) {
        value = Math.round(Number(total - locked) / 1e18);
      }
    }
    this.cached = { at: Date.now(), value };
    return value;
  }
}
