// Usage: node packages/deploy/src/safes-config-cli.ts <safes.json> <vesting-start> <config.json>
//
// Writes a deployment config from the Safes created by `CreateSafes.s.sol`. The config is then
// checked by the planner (`cli.ts`). Exits non-zero and writes nothing on any error.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

import { PlanError, buildPlan } from "./plan.ts";
import { configFromSafes, type SafesRecord } from "./safes-config.ts";

const [safesPath, vestingStart, configPath] = process.argv.slice(2);
if (!safesPath || !vestingStart || !configPath) {
  process.stderr.write("usage: safes-config-cli.ts <safes.json> <vesting-start> <config.json>\n");
  process.exit(2);
}

try {
  const record = JSON.parse(readFileSync(safesPath, "utf8")) as SafesRecord;
  const config = configFromSafes(record, vestingStart);
  buildPlan(config);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  process.stdout.write(`config written: ${configPath} (chain ${String(config.chainId)})\n`);
} catch (error) {
  const message = error instanceof PlanError ? error.message : String(error);
  process.stderr.write(`config rejected: ${message}\n`);
  process.exit(1);
}
