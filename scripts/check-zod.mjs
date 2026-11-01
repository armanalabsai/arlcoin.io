// Guards the GHSA-mrhx-c7xc-m3w5 exception in .audit-allowlist.json. The vulnerable code is
// zod 4's $ZodArray, fixed in zod 4.6.6. This fails if:
//   - @x402/core or @x402/evm resolve a zod below 4.6.6 (they require zod ^4.6.6 since 2.29.0);
//   - any installed file loads the zod 4 code (`zod/v4…`) from a zod copy below 4.6.6;
//   - ARL code imports zod (review the advisory before using it).
// Older zod 3 copies may remain under wallet libraries (WalletConnect, Reown, Coinbase); they load
// only the zod 3 root, which does not contain the vulnerable code.
// Usage: node scripts/check-zod.mjs [dir ...]   (default: the repository root)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const FIXED = [4, 6, 6];
const IMPORT = /(?:from\s*|require\(\s*|import\(\s*)["'](zod(?:\/[^"']*)?)["']/g;
const problems = [];

const atLeast = (version, min) => {
  const v = version.split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) if (v[i] !== min[i]) return v[i] > min[i];
  return true;
};

function walk(dir, visit, intoModules = false) {
  for (const name of readdirSync(dir)) {
    if ((!intoModules && name === "node_modules") || name === ".next" || name === "out") continue;
    const path = join(dir, name);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walk(path, visit, intoModules);
    else if (/\.(c|m)?(j|t)sx?$/.test(name)) visit(path);
  }
}

/** The zod version Node resolves from `dir`, or null when none is installed. */
function zodFrom(dir) {
  for (let d = resolve(dir); ; d = dirname(d)) {
    const pkg = join(d, "node_modules", "zod", "package.json");
    if (existsSync(pkg)) return JSON.parse(readFileSync(pkg, "utf8")).version;
    if (dirname(d) === d) return null;
  }
}

for (const root of process.argv.length > 2 ? process.argv.slice(2) : ["."]) {
  for (const pkg of ["@x402/core", "@x402/evm"]) {
    const dirs = [join(root, "node_modules", pkg)];
    for (const ws of ["packages/payments", "packages/provider"])
      dirs.push(join(root, ws, "node_modules", pkg));
    for (const dir of dirs.filter((d) => existsSync(d))) {
      const v = zodFrom(dir);
      if (v && !atLeast(v, FIXED)) problems.push(`${dir} resolves zod ${v}, below 4.6.6`);
    }
  }
  const modules = join(root, "node_modules");
  if (existsSync(modules))
    walk(
      modules,
      (file) => {
        if (/[/\\]node_modules[/\\]zod[/\\]/.test(file)) return;
        for (const [, spec] of readFileSync(file, "utf8").matchAll(IMPORT)) {
          if (!spec.startsWith("zod/v4")) continue;
          const v = zodFrom(dirname(file));
          if (v && !atLeast(v, FIXED)) problems.push(`${file} loads ${spec} from zod ${v}`);
        }
      },
      true,
    );
}

for (const dir of [
  "packages",
  "apps/web/src",
  "apps/web/app",
  "apps/dapp/app",
  "apps/dapp/lib",
  "apps/dapp/services",
]) {
  if (!existsSync(dir)) continue;
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
process.stdout.write("zod: @x402 uses zod >= 4.6.6; no zod 4 code is loaded from an older copy.\n");
