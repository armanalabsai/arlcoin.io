// Usage: node packages/deploy/src/distribution-cli.ts <input.json> <distribution.json>
//
// Validates a claim list and writes the Merkle root, the total to fund, and every account's
// proof. Exits non-zero and writes nothing on any error.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

import {
  DistributionError,
  buildDistribution,
  verifyDistribution,
  type DistributionInput,
} from "./distribution.ts";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  process.stderr.write("usage: distribution-cli.ts <input.json> <distribution.json>\n");
  process.exit(2);
}

try {
  const input = JSON.parse(readFileSync(inputPath, "utf8")) as DistributionInput;
  const distribution = buildDistribution(input);
  verifyDistribution(distribution);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(distribution, null, 2)}\n`);
  process.stdout.write(
    `distribution written: ${outputPath} (${String(distribution.count)} claims, root ${distribution.merkleRoot}, total ${distribution.total})\n`,
  );
} catch (error) {
  const message = error instanceof DistributionError ? error.message : String(error);
  process.stderr.write(`distribution rejected: ${message}\n`);
  process.exit(1);
}
