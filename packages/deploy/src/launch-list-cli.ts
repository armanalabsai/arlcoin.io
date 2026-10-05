// Usage: node packages/deploy/src/launch-list-cli.ts <whitelist.csv> <input.json>
//
// Turns a whitelist CSV (`address,amount` in whole ARL) into a Public Launch claim-list input
// with the approved budget (1,000,000 ARL) and per-address cap (10,000 ARL), and checks it by
// building the Merkle tree. Writes nothing on any error. Feed the output to distribution-cli.ts.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

import { DistributionError, buildDistribution, publicLaunchInput } from "./distribution.ts";

const [csvPath, outputPath] = process.argv.slice(2);
if (!csvPath || !outputPath) {
  process.stderr.write("usage: launch-list-cli.ts <whitelist.csv> <input.json>\n");
  process.exit(2);
}

try {
  const input = publicLaunchInput(readFileSync(csvPath, "utf8"));
  const checked = buildDistribution(input);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(input, null, 2)}\n`);
  process.stdout.write(
    `claim-list input written: ${outputPath} (${String(checked.count)} claims, total ${checked.total})\n`,
  );
} catch (error) {
  const message = error instanceof DistributionError ? error.message : String(error);
  process.stderr.write(`whitelist rejected: ${message}\n`);
  process.exit(1);
}
