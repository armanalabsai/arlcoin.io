// Per-client request limit for the testnet operator API: a fixed window per key (the client IP).
// State lives in the server instance, so the limit applies per instance; it stops a single client
// from draining the operator's testnet ETH and ARL through scripted requests. Faucet payments
// keep their own per-account rule (operatorRules.ts).

export interface RateLimit {
  /** Requests allowed per window. */
  readonly limit: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
}

/** POST requests per client IP per minute. */
export const OPERATOR_RATE_LIMIT: RateLimit = { limit: 30, windowMs: 60_000 };

/** Largest number of clients tracked at once; the oldest windows are dropped first. */
const MAX_KEYS = 10_000;

export type RateDecision = { ok: true } | { ok: false; retryAfterSeconds: number };

export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private readonly rule: RateLimit;

  constructor(rule: RateLimit = OPERATOR_RATE_LIMIT) {
    this.rule = rule;
  }

  check(key: string, now: number = Date.now()): RateDecision {
    const current = this.windows.get(key);
    if (!current || now - current.start >= this.rule.windowMs) {
      this.windows.delete(key);
      if (this.windows.size >= MAX_KEYS) {
        const oldest = this.windows.keys().next().value;
        if (oldest !== undefined) this.windows.delete(oldest);
      }
      this.windows.set(key, { start: now, count: 1 });
      return { ok: true };
    }
    if (current.count >= this.rule.limit) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((current.start + this.rule.windowMs - now) / 1000),
        ),
      };
    }
    current.count += 1;
    return { ok: true };
  }
}

/**
 * The client IP behind the hosting proxy: the first `x-forwarded-for` entry, then `x-real-ip`.
 * Requests without either share one key, so they are limited together rather than not at all.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
