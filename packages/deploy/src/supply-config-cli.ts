// Usage: node packages/deploy/src/supply-config-cli.ts <manifest.json> <supply-config.json>
//
// Writes the configuration of arlcoin.io/api/supply (apps/web/api/supply.mjs) from a verified
// deployment manifest: the chain, the token and every address whose balance is not circulating
// (economic specification section 5). Put the output at apps/web/api/supply-config.json.

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

import { MANIFEST_SCHEMA, type DeploymentManifest } from "./manifest.ts";

const [manifestPath, outPath] = process.argv.slice(2);
if (!manifestPath || !outPath) {
  process.stderr.write("usage: supply-config-cli.ts <manifest.json> <supply-config.json>\n");
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as DeploymentManifest;
const schema: unknown = manifest.schema;
if (schema !== MANIFEST_SCHEMA) {
  process.stderr.write(`supply config rejected: manifest schema is not ${MANIFEST_SCHEMA}\n`);
  process.exit(1);
}
const config = {
  chainId: manifest.chainId,
  token: manifest.token,
  locked: manifest.holders.filter((h) => !h.circulating).map((h) => h.address),
};
writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`);
process.stdout.write(
  `supply config written: ${outPath} (chain ${String(config.chainId)}, ${String(config.locked.length)} locked addresses)\n`,
);
