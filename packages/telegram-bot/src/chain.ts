// Read-only testnet figures for /status: faucet float and the staking reward window.
//
// Both sources are public: the operator status endpoint of the ARL app and a Base Sepolia RPC
// call. Nothing is signed or sent. Results are cached so a busy group cannot hammer either source.

export const OPERATOR_STATUS_URL = "https://arlcoin.io/api/operator/status";
export const RPC_URL = "https://sepolia.base.org";
export const STAKING = "0xA78480c1802F5c17B1007c59b7c2CF849549724e";
export const PERIOD_FINISH_SELECTOR = "0xebe2b12b"; // periodFinish()
const CACHE_MS = 60_000;
const TIMEOUT_MS = 8_000;
const WEI = 10n ** 18n;

export interface Status {
  /** Whole ARL held by the operator, null if unknown. */
  faucetArl: number | null;
  /** Whole ARL per faucet claim. */
  faucetAmount: number | null;
  /** Unix seconds, 0 if never started, null if unknown. */
  rewardPeriodFinish: number | null;
}

export function parseOperator(body: unknown): [number | null, number | null] {
  try {
    const b = body as { arl?: unknown; faucetAmount?: unknown };
    if (typeof b.arl !== "string" || typeof b.faucetAmount !== "string") return [null, null];
    return [Number(BigInt(b.arl) / WEI), Number(BigInt(b.faucetAmount) / WEI)];
  } catch {
    return [null, null];
  }
}

export function parseUint(result: unknown): number | null {
  if (typeof result !== "string" || !/^0x[0-9a-fA-F]+$/.test(result)) return null;
  return Number(BigInt(result));
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
    const [[faucetArl, faucetAmount], rewardPeriodFinish] = await Promise.all([
      this.operator(),
      this.periodFinish(),
    ]);
    const status = { faucetArl, faucetAmount, rewardPeriodFinish };
    this.cached = { at: Date.now(), status };
    return status;
  }

  private async operator(): Promise<[number | null, number | null]> {
    try {
      const res = await this.fetchFn(OPERATOR_STATUS_URL, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return [null, null];
      return parseOperator(await res.json());
    } catch {
      return [null, null];
    }
  }

  private async periodFinish(): Promise<number | null> {
    try {
      const res = await this.fetchFn(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: STAKING, data: PERIOD_FINISH_SELECTOR }, "latest"],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { result?: unknown };
      return parseUint(body.result);
    } catch {
      return null;
    }
  }
}
