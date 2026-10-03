#!/usr/bin/env node
// `npm audit` with a reviewed allowlist. Fails on any high or critical advisory in the current
// directory's dependency tree unless `.audit-allowlist.json` (repository root) lists its GHSA id
// with a reason and an expiry date. Also fails when an entry has expired, so every exception is
// reviewed again, and when an entry no longer matches anything, so stale exceptions are removed.
//
// Usage (in a package directory): node <repo>/scripts/audit.mjs

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { URL } from "node:url";

const BLOCKING = new Set(["high", "critical"]);
const allowlist = JSON.parse(
  readFileSync(new URL("../.audit-allowlist.json", import.meta.url), "utf8"),
).advisories;

let report;
try {
  report = execFileSync("npm", ["audit", "--json"], { encoding: "utf8" });
} catch (error) {
  // npm audit exits non-zero when it finds anything; the report is still on stdout.
  report = error.stdout;
}
const { vulnerabilities = {} } = JSON.parse(report);

const found = new Map(); // GHSA id → packages it affects
for (const [name, v] of Object.entries(vulnerabilities)) {
  for (const via of v.via) {
    if (typeof via !== "object" || !BLOCKING.has(via.severity)) continue;
    const id = /GHSA-[a-z0-9-]+/i.exec(via.url ?? "")?.[0] ?? via.title;
    found.set(id, [...(found.get(id) ?? []), name]);
  }
}

const today = new Date().toISOString().slice(0, 10);
const problems = [];
for (const [id, packages] of found) {
  const entry = allowlist.find((a) => a.id === id);
  if (!entry) problems.push(`${id} (${packages.join(", ")}): not allowlisted`);
  else if (entry.expires < today) problems.push(`${id}: allowlist entry expired ${entry.expires}`);
  else
    process.stdout.write(
      `allowed ${id} (${packages.join(", ")}) until ${entry.expires}: ${entry.reason}\n`,
    );
}
for (const entry of allowlist) {
  if (!found.has(entry.id) && (entry.scope ?? []).includes(process.cwd().split("/").pop())) {
    problems.push(`${entry.id}: allowlisted but no longer reported here; remove the entry`);
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.map((p) => `audit: ${p}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`audit: no high or critical advisories outside the allowlist\n`);
