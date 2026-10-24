// Guards the GHSA-mrhx-c7xc-m3w5 exception in .audit-allowlist.json. The vulnerable code
// ($ZodArray in zod's v4 core) ships inside zod 3.25.x under zod/v4, but nothing here loads it:
// @x402/core and @x402/evm import the zod 3 root, and ARL code does not import zod at all. This
// fails if either stops being true, so the exception cannot outlive its reason.
// Usage: node scripts/check-zod-v3-only.mjs [dir ...]   (default: the repository root)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const roots = process.argv.length > 2 ? process.argv.slice(2) : ["."];
const IMPORT = /(?:from\s*|require\(\s*|import\(\s*)["'](zod(?:\/[^"']*)?)["']/g;
const problems = [];

function walk(dir, visit) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "out") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, visit);
    else if (/\.(c|m)?(j|t)sx?$/.test(name)) visit(path);
  }
}

for (const root of roots) {
  for (const pkg of ["@x402/core", "@x402/evm"]) {
    const dist = join(root, "node_modules", pkg, "dist");
    try {
      statSync(dist);
    } catch {
      continue;
    }
    walk(dist, (file) => {
      for (const [, spec] of readFileSync(file, "utf8").matchAll(IMPORT)) {
        if (spec !== "zod") problems.push(`${file} imports ${spec}`);
      }
    });
  }
}
for (const dir of [
  "packages",
  "apps/web/src",
  "apps/web/app",
  "apps/dapp/app",
  "apps/dapp/lib",
  "apps/dapp/services",
]) {
  try {
    statSync(dir);
  } catch {
    continue;
  }
  walk(dir, (file) => {
    for (const [, spec] of readFileSync(file, "utf8").matchAll(IMPORT)) {
      problems.push(`${file} imports ${spec}; review GHSA-mrhx-c7xc-m3w5 before using zod`);
    }
  });
}
if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("zod: only @x402 uses it, through the zod 3 root; zod/v4 is not loaded.\n");
