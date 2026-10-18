// Fails unless every test in a `forge test --json` report passed and every fuzz test ran at
// least the given number of times. Usage: node scripts/check-forge-evidence.mjs <report.json> <runs>
import { readFileSync } from "node:fs";
import process from "node:process";

const [reportPath, minRuns] = process.argv.slice(2);
if (!minRuns) {
  process.stderr.write("usage: check-forge-evidence.mjs <forge-test.json> <min-fuzz-runs>\n");
  process.exit(2);
}
const report = JSON.parse(readFileSync(reportPath, "utf8"));
let tests = 0;
let fuzz = 0;
let invariant = 0;
const problems = [];
for (const [suite, s] of Object.entries(report)) {
  for (const [name, t] of Object.entries(s.test_results)) {
    tests += 1;
    if (t.status !== "Success") problems.push(`${suite} ${name}: ${String(t.status)}`);
    if (t.kind?.Fuzz) {
      fuzz += 1;
      if (t.kind.Fuzz.runs < Number(minRuns))
        problems.push(`${suite} ${name}: ${String(t.kind.Fuzz.runs)} runs`);
    }
    if (t.kind?.Invariant) invariant += 1;
  }
}
if (tests === 0) problems.push("no tests in the report");
if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(
  `${String(tests)} tests passed (${String(fuzz)} fuzz at >= ${minRuns} runs, ${String(invariant)} invariant).\n`,
);
