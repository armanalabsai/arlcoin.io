// Usage: node packages/deploy/src/explorer-cli.ts <plan.json> <deployment.json>
//          [--check-broadcast <run-latest.json>] [--run]
//
// Prints the `forge verify-contract` command for every contract DeployARL created (run them in
// contracts/). --check-broadcast first proves the constructor arguments equal those in the
// deployment's broadcast file. --run executes the commands, on Base Sepolia only; Foundry reads
// the explorer API key from ETHERSCAN_API_KEY, which is never printed.
// Exit codes: 0 done, 3 a mismatch, 1 an error, 2 wrong usage.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { checkAgainstBroadcast, explorerTargets, verifyCommand } from "./explorer.ts";
import type { DeploymentRecord } from "./manifest.ts";
import { TESTNET_CHAIN_ID, type DeployPlan } from "./plan.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : (args[i + 1] ?? "");
};
const [planPath, deploymentPath] = args.filter(
  (a, i) => !a.startsWith("--") && args[i - 1] !== "--check-broadcast",
);
if (!planPath || !deploymentPath) {
  process.stderr.write(
    "usage: explorer-cli.ts <plan.json> <deployment.json> [--check-broadcast <run.json>] [--run]\n",
  );
  process.exit(2);
}
const json = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));

try {
  const plan = json(planPath) as DeployPlan;
  const targets = explorerTargets(plan, json(deploymentPath) as DeploymentRecord);
  const broadcast = flag("--check-broadcast");
  if (broadcast !== undefined) {
    const problems = checkAgainstBroadcast(targets, json(broadcast) as never);
    if (problems.length) {
      process.stderr.write(
        `constructor arguments do not match the broadcast:\n  ${problems.join("\n  ")}\n`,
      );
      process.exit(3);
    }
    process.stdout.write(
      `constructor arguments match the broadcast (${String(targets.length)} contracts)\n`,
    );
  }
  const contracts = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "contracts");
  for (const t of targets) {
    const cmd = verifyCommand(plan.chainId, t);
    process.stdout.write(`# ${t.label}\nforge ${cmd.join(" ")}\n`);
    if (args.includes("--run")) {
      if (plan.chainId !== TESTNET_CHAIN_ID) throw new Error("--run is for Base Sepolia only");
      if (!process.env.ETHERSCAN_API_KEY)
        throw new Error("set ETHERSCAN_API_KEY in the environment");
      const r = spawnSync("forge", cmd, { cwd: contracts, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`verification of ${t.label} failed`);
    }
  }
} catch (error) {
  process.stderr.write(
    `explorer verification failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
