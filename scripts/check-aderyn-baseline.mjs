// Fails if Aderyn reports a result that is not in the triaged baseline
// (security/aderyn-baseline.json, reasons in security/2026-10-17/triage.md).
// Usage: node scripts/check-aderyn-baseline.mjs <aderyn.json> <baseline.json>
import { readFileSync } from "node:fs";
import process from "node:process";

const [reportPath, baselinePath] = process.argv.slice(2);
if (!baselinePath) {
  process.stderr.write("usage: check-aderyn-baseline.mjs <aderyn.json> <baseline.json>\n");
  process.exit(2);
}
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const baseline = new Set(JSON.parse(readFileSync(baselinePath, "utf8")).results);

const found = [];
for (const severity of ["high_issues", "low_issues"]) {
  for (const issue of report[severity]?.issues ?? []) {
    for (const i of issue.instances)
      found.push(`${issue.detector_name} ${i.contract_path}:${String(i.line_no)}`);
  }
}
const untriaged = found.filter((r) => !baseline.has(r));
if (untriaged.length > 0) {
  process.stderr.write(`Untriaged Aderyn results:\n${untriaged.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Aderyn: ${String(found.length)} results, all triaged.\n`);
