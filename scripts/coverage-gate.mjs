#!/usr/bin/env node
// Coverage gate for the ARL contracts. Merges the lcov reports of the Foundry profiles (default:
// test/, zk: test-zk/) and fails unless every contract in contracts/src is present with 100% line
// and function coverage, and branch coverage across them is at least MIN_BRANCH_PERCENT. A file with
// no function or constructor (a constants-only library such as ARLAllocation) has nothing to cover.
// Writes a Markdown table to stdout (and to $GITHUB_STEP_SUMMARY when set).
//
// Usage: node scripts/coverage-gate.mjs <lcov.info> [<lcov.info> ...]

import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import process from "node:process";
import { URL } from "node:url";

const MIN_BRANCH_PERCENT = 90;

const srcDir = new URL("../contracts/src/", import.meta.url);
const contracts = readdirSync(srcDir)
  .filter((f) => f.endsWith(".sol"))
  .filter((f) =>
    /\b(function|constructor|modifier)\b/.test(readFileSync(new URL(f, srcDir), "utf8")),
  )
  .map((f) => `src/${f}`);

/** @type {Map<string, {lines: Map<number, number>, fns: Map<string, number>, branches: Map<string, number>}>} */
const files = new Map();
const hits = (/** @type {string} */ h) => (h === "-" ? 0 : Number(h));

for (const path of process.argv.slice(2)) {
  let current;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const [tag, rest = ""] = line.split(/:(.*)/s);
    if (tag === "SF") {
      if (!files.has(rest))
        files.set(rest, { lines: new Map(), fns: new Map(), branches: new Map() });
      current = files.get(rest);
    } else if (!current) {
      continue;
    } else if (tag === "DA") {
      const [n, h] = rest.split(",");
      current.lines.set(Number(n), Math.max(current.lines.get(Number(n)) ?? 0, hits(h)));
    } else if (tag === "FNDA") {
      const [h, name] = rest.split(",");
      current.fns.set(name, Math.max(current.fns.get(name) ?? 0, hits(h)));
    } else if (tag === "BRDA") {
      const [n, block, branch, h] = rest.split(",");
      const key = `${n},${block},${branch}`;
      current.branches.set(key, Math.max(current.branches.get(key) ?? 0, hits(h)));
    }
  }
}

const pct = (/** @type {number} */ a, /** @type {number} */ b) =>
  b === 0 ? 100 : Math.floor((a / b) * 10000) / 100;
const covered = (/** @type {Map<unknown, number>} */ m) =>
  [...m.values()].filter((h) => h > 0).length;

const problems = [];
const rows = [];
let branchHit = 0;
let branchTotal = 0;
for (const name of contracts) {
  const f = files.get(name);
  if (!f) {
    problems.push(`${name}: no coverage data`);
    continue;
  }
  const [lh, lt] = [covered(f.lines), f.lines.size];
  const [fh, ft] = [covered(f.fns), f.fns.size];
  const [bh, bt] = [covered(f.branches), f.branches.size];
  branchHit += bh;
  branchTotal += bt;
  if (lh < lt) problems.push(`${name}: lines ${lh}/${lt}`);
  if (fh < ft) problems.push(`${name}: functions ${fh}/${ft}`);
  rows.push(
    `| ${name} | ${pct(lh, lt)}% (${lh}/${lt}) | ${pct(fh, ft)}% (${fh}/${ft}) | ${pct(bh, bt)}% (${bh}/${bt}) |`,
  );
}
const branchPercent = pct(branchHit, branchTotal);
if (branchPercent < MIN_BRANCH_PERCENT) {
  problems.push(`branches ${branchPercent}% < ${MIN_BRANCH_PERCENT}%`);
}

const table = [
  "| Contract | Lines | Functions | Branches |",
  "| --- | --- | --- | --- |",
  ...rows,
  `| **Total branches** | | | ${branchPercent}% (${branchHit}/${branchTotal}) |`,
  "",
].join("\n");
process.stdout.write(table);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);

if (problems.length > 0) {
  process.stderr.write(`${problems.map((p) => `coverage: ${p}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(
  `coverage: ${contracts.length} contracts, 100% lines and functions, branches >= ${MIN_BRANCH_PERCENT}%\n`,
);
