import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// arlcoin.io serves the website and, under /app, the app (scripts/build-site.sh) from Cloudflare
// Pages. The two get different headers from apps/web/public/_headers: the website keeps its strict
// policy, and the app, which talks to RPC nodes and wallets, keeps every header except the
// website's source lists.

interface Rule {
  pattern: RegExp;
  set: { key: string; value: string }[];
  detach: string[];
}

/** Parses a Cloudflare `_headers` file: a path pattern, then indented `Name: value` or `! Name`. */
function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!line.startsWith(" ")) {
      const re = line
        .trim()
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      rules.push({ pattern: new RegExp(`^${re}$`), set: [], detach: [] });
      continue;
    }
    const rule = rules.at(-1);
    assert.ok(rule, `header line before any path: ${line}`);
    const body = line.trim();
    if (body.startsWith("!")) rule.detach.push(body.slice(1).trim().toLowerCase());
    else {
      const i = body.indexOf(":");
      rule.set.push({ key: body.slice(0, i).trim(), value: body.slice(i + 1).trim() });
    }
  }
  return rules;
}

const rules = parseHeaders(readFileSync(new URL("../../public/_headers", import.meta.url), "utf8"));

/**
 * The headers Cloudflare sends for a path: every matching rule applies, values of a header set by
 * two rules are joined, and `! Name` in a rule removes what the other rules set for that header.
 */
function headersFor(path: string): Map<string, string[]> {
  const matching = rules.filter((r) => r.pattern.test(path));
  const out = new Map<string, string[]>();
  for (const rule of matching) {
    for (const h of rule.set) {
      const key = h.key.toLowerCase();
      out.set(key, [...(out.get(key) ?? []), h.value]);
    }
  }
  for (const rule of matching) {
    for (const key of rule.detach) {
      const own = rule.set.filter((h) => h.key.toLowerCase() === key).map((h) => h.value);
      out.set(key, own);
    }
  }
  return out;
}

function header(path: string, key: string): string {
  const values = headersFor(path).get(key.toLowerCase()) ?? [];
  assert.ok(values.length <= 1, `${path}: ${key} set ${String(values.length)} times`);
  return values[0] ?? "";
}

describe("hosting: website and app headers", () => {
  it("the website keeps its strict policy on every page", () => {
    for (const path of ["/", "/buy/", "/docs/whitepaper/", "/application/", "/apps/"]) {
      assert.match(header(path, "Content-Security-Policy"), /default-src 'self'/, path);
      assert.equal(header(path, "Cross-Origin-Opener-Policy"), "same-origin", path);
      assert.equal(header(path, "X-Frame-Options"), "DENY", path);
      assert.match(header(path, "Strict-Transport-Security"), /max-age=63072000/, path);
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

describe("hosting: redirects", () => {
  const redirects = readFileSync(new URL("../../public/_redirects", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "" && !l.startsWith("#"))
    .map((l) => l.trim().split(/\s+/));

  it("sends the removed team layer to the Core, with and without the trailing slash", () => {
    for (const source of ["/core/team", "/core/team/", "/core/team/*"]) {
      const rule = redirects.find((r) => r[0] === source);
      assert.ok(rule, source);
      assert.equal(rule[1], "/core/");
      assert.equal(rule[2], "301");
    }
  });
});
