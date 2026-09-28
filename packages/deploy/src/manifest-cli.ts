// Usage: node packages/deploy/src/manifest-cli.ts <plan.json> <deployment.json> <manifest.json>
//
// Writes the official deployment manifest: every genesis and protocol-controlled address and
// whether its balance counts as circulating. Exits non-zero and writes nothing on any error.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

import { ManifestError, buildManifest, type DeploymentRecord } from "./manifest.ts";
import type { DeployPlan } from "./plan.ts";

const [planPath, deploymentPath, manifestPath] = process.argv.slice(2);
if (!planPath || !deploymentPath || !manifestPath) {
  process.stderr.write("usage: manifest-cli.ts <plan.json> <deployment.json> <manifest.json>\n");
  process.exit(2);
}

try {
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as DeployPlan;
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8")) as DeploymentRecord;
  const manifest = buildManifest(plan, deployment);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `manifest written: ${manifestPath} (${String(manifest.holders.length)} holders)\n`,
  );
} catch (error) {
  const message = error instanceof ManifestError ? error.message : String(error);
  process.stderr.write(`manifest rejected: ${message}\n`);
  process.exit(1);
}
