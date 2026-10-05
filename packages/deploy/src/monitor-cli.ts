// Usage: node packages/deploy/src/monitor-cli.ts <plan.json> <deployment.json> <rpc-url> <from-block>
//
// Read-only health check of a live deployment (see monitor.ts). Prints the report as JSON.
// Exit codes: 0 healthy (notices may still need review), 3 a critical finding, 1 the check
// could not run. Run it on a schedule; pass the previous run's block as <from-block> to scan only
// new timelock events.

import { readFileSync } from "node:fs";
import process from "node:process";

import type { DeploymentRecord } from "./manifest.ts";
import { assess, readSnapshot } from "./monitor.ts";
import type { DeployPlan } from "./plan.ts";

const [planPath, deploymentPath, rpcUrl, from] = process.argv.slice(2);
if (!planPath || !deploymentPath || !rpcUrl || !from || !/^\d+$/.test(from)) {
  process.stderr.write(
    "usage: monitor-cli.ts <plan.json> <deployment.json> <rpc-url> <from-block>\n",
  );
  process.exit(2);
}

try {
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as DeployPlan;
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8")) as DeploymentRecord;
  const report = assess(
    plan,
    deployment,
    await readSnapshot(plan, deployment, rpcUrl, BigInt(from)),
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  // Set, not forced: process.exit() while the RPC client's sockets are still closing aborts Node
  // on Windows.
  process.exitCode = report.healthy ? 0 : 3;
} catch (error) {
  process.stderr.write(
    `monitor failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
