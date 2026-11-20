// ARL's first verified job on Base Mainnet (arl-reexec/1).
//
// Checks the four arl-policy/1 verification policies published in spec/arl-policy/v0.1.0 and
// writes a deterministic report to /out/result.json: each file's SHA-256, the SHA-256 of its
// canonical JSON, and whether it passes the structural checks below. No network, no dependencies,
// no timestamps: every validator that re-runs it must get byte-identical output.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const FILES = ["code-tests", "data-recompute", "gpu-inference", "research-sources"];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Canonical JSON: keys sorted by UTF-16 code units, no whitespace, integers only. */
function canonicalize(v) {
  if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new Error(`not an integer: ${v}`);
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  const keys = Object.keys(v).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(v[k])}`).join(",")}}`;
}

function check(id, p) {
  const problems = [];
  const window = (w) =>
    Array.isArray(w) && w.length === 2 && w.every(Number.isSafeInteger) && 0 < w[0] && w[0] <= w[1];
  if (p.version !== "arl-policy/1") problems.push("version is not arl-policy/1");
  if (p.id !== id) problems.push("id does not match the file name");
  const c = p.committee ?? {};
  if (!(
    Number.isSafeInteger(c.min_size) &&
    c.min_size >= 1 &&
    c.min_size <= c.max_size &&
    c.max_size <= 7
  ))
    problems.push("committee size is outside 1..7");
  if (!window(p.vote_window_seconds)) problems.push("vote window is not a valid range");
  if (!window(p.challenge_window_seconds)) problems.push("challenge window is not a valid range");
  if (!/^[1-9][0-9]*$/.test(String(p.min_bond_floor)))
    problems.push("bond floor is not a positive integer");
  if (!Array.isArray(p.tiers) || p.tiers.length === 0) problems.push("no tier");
  if (!Array.isArray(p.required_evidence) || p.required_evidence.length === 0)
    problems.push("no required evidence");
  return problems;
}

const policies = FILES.map((id) => {
  const bytes = readFileSync(`policies/${id}.json`);
  const parsed = JSON.parse(bytes.toString("utf8"));
  const problems = check(id, parsed);
  return {
    id,
    sha256: sha256(bytes),
    canonical_sha256: sha256(Buffer.from(canonicalize(parsed), "utf8")),
    pass: problems.length === 0,
    problems,
  };
});

const report = {
  job: "arl-first-verified-job/1",
  policies,
  all_pass: policies.every((p) => p.pass),
};
writeFileSync("/out/result.json", `${canonicalize(report)}\n`);
process.exit(report.all_pass ? 0 : 1);
