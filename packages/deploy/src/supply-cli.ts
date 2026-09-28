// Usage: node packages/deploy/src/supply-cli.ts <manifest.json> <rpc-url>
//
// Prints total, locked and circulating supply as JSON (base-unit integer strings and exact ARL
// decimal strings), read from the chain at a single block. Exits non-zero on any error.

import { readFileSync } from "node:fs";
import process from "node:process";

import { formatReport, readSupply } from "./circulating.ts";
import type { DeploymentManifest } from "./manifest.ts";

const [manifestPath, rpcUrl] = process.argv.slice(2);
if (!manifestPath || !rpcUrl) {
  process.stderr.write("usage: supply-cli.ts <manifest.json> <rpc-url>\n");
  process.exit(2);
}

try {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as DeploymentManifest;
  const report = await readSupply(manifest, rpcUrl);
  process.stdout.write(`${JSON.stringify(formatReport(report), null, 2)}\n`);
} catch (error) {
  process.stderr.write(
    `supply read failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
