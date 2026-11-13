// Builds the npm package `arl-sdk` into dist/package: compiled JavaScript with type declarations,
// a package.json for npm and the README. Publish from that folder:
//
//   node build.ts && cd dist/package && npm publish --access public

import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist", "package");
rmSync(join(here, "dist"), { recursive: true, force: true });
execFileSync("npx", ["tsc", "-p", "tsconfig.build.json"], {
  cwd: here,
  stdio: "inherit",
  shell: process.platform === "win32",
});

const source = JSON.parse(readFileSync(join(here, "package.json"), "utf8")) as {
  version: string;
  dependencies: Record<string, string>;
};
const pkg = {
  name: "arl-sdk",
  version: source.version,
  description:
    "ARL Protocol SDK: escrowed and verified jobs for AI agents, compute payments and ARL purchase on Base Mainnet",
  keywords: ["arl", "base", "escrow", "erc-8183", "ai-agents", "x402", "viem"],
  license: "Apache-2.0",
  homepage: "https://arlcoin.io/build",
  author: "Alazdg <team@arlcoin.io>",
  repository: {
    type: "git",
    url: "git+https://github.com/armanalabsai/arlcoin.io.git",
    directory: "packages/sdk",
  },
  type: "module",
  main: "./index.js",
  types: "./index.d.ts",
  exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
  dependencies: source.dependencies,
};
writeFileSync(join(out, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
copyFileSync(join(here, "README.md"), join(out, "README.md"));
process.stdout.write(`built ${pkg.name}@${pkg.version} in dist/package\n`);
