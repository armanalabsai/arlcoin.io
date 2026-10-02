// Reproducible build and deployment proof (see bytecode.ts).
//
//   bytecode-cli.ts manifest <contracts-dir> <manifest.json>   write the manifest from a build
//   bytecode-cli.ts check    <contracts-dir> <manifest.json>   a clean build must match it
//   bytecode-cli.ts verify   <contracts-dir> <plan.json> <deployment.json> <rpc-url>
//
// <contracts-dir> holds foundry.toml and the build output in out/. Exit codes: 0 match, 3 a
// mismatch, 1 the check could not run, 2 wrong usage.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

import {
  buildManifest,
  diffManifest,
  readCompilerSettings,
  verifyDeployment,
  type BytecodeManifest,
} from "./bytecode.ts";
import type { DeploymentRecord } from "./manifest.ts";
import type { DeployPlan } from "./plan.ts";

function usage(): never {
  process.stderr.write(
    "usage: bytecode-cli.ts manifest|check <contracts-dir> <manifest.json>\n" +
      "       bytecode-cli.ts verify <contracts-dir> <plan.json> <deployment.json> <rpc-url>\n",
  );
  process.exit(2);
}

const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

async function run(args: string[]): Promise<number> {
  const [command, dir, a, b, c] = args;
  if (!dir) usage();
  const out = join(dir, "out");
  if ((command === "manifest" || command === "check") && a) {
    const built = buildManifest(out, readCompilerSettings(join(dir, "foundry.toml")));
    if (command === "manifest") {
      writeFileSync(a, `${JSON.stringify(built, null, 2)}\n`);
      process.stdout.write(`bytecode manifest written: ${a}\n`);
      return 0;
    }
    const diff = diffManifest(json(a) as BytecodeManifest, built);
    if (diff.length) {
      process.stderr.write(`build does not reproduce ${a}:\n  ${diff.join("\n  ")}\n`);
      return 3;
    }
    const n = Object.keys(built.contracts).length;
    process.stdout.write(`build reproduces ${a} (${String(n)} contracts)\n`);
    return 0;
  }
  if (command === "verify" && a && b && c) {
    const findings = await verifyDeployment(
      out,
      json(a) as DeployPlan,
      json(b) as DeploymentRecord,
      c,
    );
    for (const f of findings) {
      process.stdout.write(
        `  ${f.ok ? "ok  " : "FAIL"}  ${f.contract}: ${f.check} (${f.detail})\n`,
      );
    }
    const failed = findings.filter((f) => !f.ok).length;
    process.stdout.write(
      failed ? `${String(failed)} checks failed\n` : "deployment matches the build and the plan\n",
    );
    return failed ? 3 : 0;
  }
  usage();
}

try {
  process.exit(await run(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(
    `bytecode check failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
