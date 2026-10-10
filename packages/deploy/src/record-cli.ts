// Usage:
//   node packages/deploy/src/record-cli.ts <safes|arl|compute-payment|distributor> <run.json>
//     <rpc-url> <record.json> [--distribution <list.json>] [--contracts <dir>] [--local-anvil]
//
// Writes a verified deployment record from a Foundry run file (see record.ts): the broadcast
// file (`broadcast/<Script>/84532/run-latest.json`) or, after signing from a phone, the dry-run
// file the Deploy screen signed (`broadcast/<Script>/84532/dry-run/run-latest.json`). Every
// contract the run created is checked on chain first; nothing is written unless all checks pass,
// and an existing record is never left half-written.
//
// Base Sepolia (84532) only. `--local-anvil` accepts a local Anvil node for a rehearsal: a plain
// chain (31337) or a fork of Base Sepolia. Such a record is stamped `local-anvil-rehearsal` or
// `base-sepolia-fork-rehearsal` and is not evidence of anything on a public network.
// `--contracts` is the Foundry project with the build in out/ (default: contracts/).
// Exit codes: 0 written, 3 a check failed (nothing written), 1 could not run, 2 wrong usage.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { readArtifact, type Artifact } from "./bytecode.ts";
import {
  RECORD_KINDS,
  parseRunFile,
  rpcReader,
  sha256,
  verifyRun,
  writeRecordAtomically,
  type ArtifactName,
  type RecordKind,
} from "./record.ts";

const NEEDS: Record<RecordKind, ArtifactName[]> = {
  safes: [],
  arl: ["ARLVestingWallet", "ARLTimelock", "ARLToken"],
  "compute-payment": ["ComputePayment"],
  distributor: ["ARLMerkleDistributor"],
};

function usage(): never {
  process.stderr.write(
    `usage: record-cli.ts <${RECORD_KINDS.join("|")}> <run.json> <rpc-url> <record.json> ` +
      "[--distribution <list.json>] [--contracts <dir>] [--local-anvil]\n",
  );
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  if (!v || v.startsWith("--")) usage();
  args.splice(i, 2);
  return v;
};
const localAnvil = args.includes("--local-anvil");
if (localAnvil) args.splice(args.indexOf("--local-anvil"), 1);
const distributionPath = flag("--distribution");
const contractsDir =
  flag("--contracts") ?? fileURLToPath(new URL("../../../contracts", import.meta.url));
const [kind, runPath, rpcUrl, outPath, ...rest] = args;
if (!kind || !runPath || !rpcUrl || !outPath || rest.length > 0) usage();
if (!(RECORD_KINDS as readonly string[]).includes(kind)) usage();

try {
  const raw = readFileSync(runPath, "utf8");
  const run = parseRunFile(JSON.parse(raw));
  const artifacts: Partial<Record<ArtifactName, Artifact>> = {};
  for (const name of NEEDS[kind as RecordKind]) {
    artifacts[name] = readArtifact(join(contractsDir, "out"), name);
  }
  const distribution = distributionPath
    ? (JSON.parse(readFileSync(distributionPath, "utf8")) as { merkleRoot: string; total: string })
    : undefined;
  const result = await verifyRun(run, rpcReader(rpcUrl), {
    kind: kind as RecordKind,
    artifacts,
    localAnvil,
    distribution,
    runFileHash: sha256(raw),
  });
  for (const f of result.findings) {
    process.stdout.write(`  ${f.ok ? "ok  " : "FAIL"}  ${f.check}: ${f.detail}\n`);
  }
  if (!result.ok || !result.record) {
    const failed = result.findings.filter((f) => !f.ok).length;
    process.stderr.write(`record not written: ${String(failed)} check(s) failed\n`);
    process.exitCode = 3;
  } else {
    writeRecordAtomically(outPath, result.record);
    process.stdout.write(
      `verified record written: ${outPath} (${String(result.findings.length)} checks, block ${result.record.verified.block}, ${result.record.verified.network})\n`,
    );
  }
} catch (error) {
  process.stderr.write(
    `record not written: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
