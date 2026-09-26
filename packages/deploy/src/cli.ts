// Usage: node packages/deploy/src/cli.ts <config.json> <plan.json>
//
// Reads a deployment config, builds and validates the plan, and writes it. Exits non-zero and
// writes nothing if any rule fails.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

import { PlanError, buildPlan, type DeployConfig } from "./plan.ts";

const [configPath, planPath] = process.argv.slice(2);
if (!configPath || !planPath) {
  process.stderr.write("usage: cli.ts <config.json> <plan.json>\n");
  process.exit(2);
}

try {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as DeployConfig;
  const plan = buildPlan(config);
  mkdirSync(dirname(planPath), { recursive: true });
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  process.stdout.write(
    `plan written: ${planPath} (network ${plan.network}, chain ${plan.chainId}, launch ${plan.source.launchDate})\n`,
  );
} catch (error) {
  const message = error instanceof PlanError ? error.message : String(error);
  process.stderr.write(`deployment plan rejected: ${message}\n`);
  process.exit(1);
}
