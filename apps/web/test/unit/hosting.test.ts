import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// arlcoin.io serves the website and, under /app, the app (scripts/build-site.sh). The two get
// different headers from apps/web/vercel.json: the website keeps its strict policy, and the app,
// which talks to RPC nodes and wallets, keeps every header except the website's source lists.

interface Rule {
  source: string;
  headers: { key: string; value: string }[];
}

const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
  headers: Rule[];
};

/** Vercel matches `source` as a path-to-regexp pattern; these two read the same as a regex. */
const matches = (rule: Rule, path: string) => new RegExp(`^${rule.source}$`).test(path);

function headersFor(path: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rule of vercel.headers.filter((r) => matches(r, path))) {
    for (const h of rule.headers) {
      assert.ok(!out.has(h.key), `${path}: ${h.key} set by two rules`);
      out.set(h.key, h.value);
    }
  }
  return out;
}

const header = (path: string, key: string) => headersFor(path).get(key) ?? "";

describe("hosting: website and app headers", () => {
  it("the website keeps its strict policy on every page", () => {
    for (const path of ["/", "/buy/", "/docs/whitepaper/", "/application/", "/apps/"]) {
      assert.match(header(path, "Content-Security-Policy"), /default-src 'self'/, path);
      assert.equal(header(path, "Cross-Origin-Opener-Policy"), "same-origin", path);
    }
  });

  it("the app under /app gets exactly one policy, never the website's", () => {
    for (const path of ["/app/", "/app/claim/", "/app/trade/", "/app/deploy/", "/app/_next/x.js"]) {
      const csp = header(path, "Content-Security-Policy");
      assert.ok(csp, path);
      assert.doesNotMatch(csp, /default-src|connect-src/, path);
      assert.match(csp, /frame-ancestors 'none'/, path);
      assert.equal(header(path, "X-Frame-Options"), "DENY", path);
      assert.equal(header(path, "X-Content-Type-Options"), "nosniff", path);
      // Wallets open popups (Coinbase smart wallet); a same-origin opener policy would cut them off.
      assert.equal(header(path, "Cross-Origin-Opener-Policy"), "same-origin-allow-popups", path);
    }
  });
});
