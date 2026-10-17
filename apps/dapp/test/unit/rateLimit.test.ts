import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RateLimiter, clientKey } from "../../lib/server/rateLimit.ts";

describe("operator rate limit", () => {
  it("allows the limit within a window, refuses the next, and resets after the window", () => {
    const limiter = new RateLimiter({ limit: 3, windowMs: 60_000 });
    for (let i = 0; i < 3; i++) assert.deepEqual(limiter.check("a", 1_000 + i), { ok: true });
    assert.deepEqual(limiter.check("a", 31_000), { ok: false, retryAfterSeconds: 30 });
    assert.deepEqual(limiter.check("a", 61_000), { ok: true });
  });

  it("keeps clients apart", () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });
    assert.deepEqual(limiter.check("a", 0), { ok: true });
    assert.equal(limiter.check("a", 1).ok, false);
    assert.deepEqual(limiter.check("b", 1), { ok: true });
  });

  it("reads the client IP from the proxy headers", () => {
    assert.equal(clientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4");
    assert.equal(clientKey(new Headers({ "x-real-ip": "5.6.7.8" })), "5.6.7.8");
    assert.equal(clientKey(new Headers()), "unknown");
  });
});
