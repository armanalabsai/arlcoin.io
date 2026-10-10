// Usage: node packages/deploy/src/sepolia-ecosystem-cli.ts <ecosystem.json> <operator> <out-prefix>
//
// Reads the record written by DeploySepoliaEcosystem and writes the two Safe Transaction Builder
// batches: <out-prefix>-community.json (Community & Staking Safe: staking rewards) and
// <out-prefix>-ecosystem.json (Ecosystem & Growth Safe: the testnet operator's float). Base
// Sepolia only. Nothing is sent.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

import {
  ecosystemBatches,
  SepoliaEcosystemError,
  type EcosystemDeployment,
} from "./sepolia-ecosystem.ts";

const [deploymentPath, operator, prefix] = process.argv.slice(2);
if (!deploymentPath || !operator || !prefix) {
  process.stderr.write(
    "usage: sepolia-ecosystem-cli.ts <ecosystem.json> <operator> <out-prefix>\n",
  );
  process.exit(2);
}

try {
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8")) as EcosystemDeployment;
  const { community, ecosystem } = ecosystemBatches(deployment, operator, Date.now());
  mkdirSync(dirname(prefix), { recursive: true });
  writeFileSync(`${prefix}-community.json`, `${JSON.stringify(community, null, 2)}\n`);
  writeFileSync(`${prefix}-ecosystem.json`, `${JSON.stringify(ecosystem, null, 2)}\n`);
  process.stdout.write(
    `Safe batches written: ${prefix}-community.json, ${prefix}-ecosystem.json\n`,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof SepoliaEcosystemError ? "rejected" : "failed"}: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
