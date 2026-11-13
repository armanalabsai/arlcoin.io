// Read-only Base Mainnet figures for /status: total ARL staked and the staking reward window.
//
// Both come from public eth_call reads of the staking contract on Base Mainnet. Nothing is signed
// or sent. Results are cached so a busy group cannot hammer the RPC.

export const RPC_URL = "https://mainnet.base.org";
export const STAKING = "0x15e257009BE9B1875fbfa69D291320aaFE3fa102";
export const TOTAL_SUPPLY_SELECTOR = "0x18160ddd"; // totalSupply(): ARL staked
export const PERIOD_FINISH_SELECTOR = "0xebe2b12b"; // periodFinish()
const CACHE_MS = 60_000;
const TIMEOUT_MS = 8_000;
const WEI = 10n ** 18n;

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

export class StatusReader {
  private cached: { at: number; status: Status } | null = null;
  private readonly fetchFn: Fetch;
  constructor(fetchFn: Fetch = fetch) {
    this.fetchFn = fetchFn;
  }

  async read(): Promise<Status> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.status;
    const [staked, finish] = await Promise.all([
      this.call(TOTAL_SUPPLY_SELECTOR),
      this.call(PERIOD_FINISH_SELECTOR),
    ]);
    const status = { totalStaked: parseArl(staked), rewardPeriodFinish: parseUint(finish) };
    this.cached = { at: Date.now(), status };
    return status;
  }

  private async call(data: string): Promise<unknown> {
    try {
      const res = await this.fetchFn(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: STAKING, data }, "latest"],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return ((await res.json()) as { result?: unknown }).result ?? null;
    } catch {
      return null;
    }
  }
}
