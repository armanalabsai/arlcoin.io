// Builds the npm package `arl-protocol-mcp` into dist/package: the server and the protocol
// documents it uses (packages/protocol), compiled side by side, with a package.json and README.
// Publish from that folder:
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
  name: "arl-protocol-mcp",
  version: source.version,
  description:
    "ARL Protocol MCP server: check arl-task/1 tasks, read verified jobs on Base Mainnet and prepare unsigned transactions; it never holds a key",
  keywords: ["arl", "mcp", "model-context-protocol", "base", "escrow", "ai-agents"],
  license: "Apache-2.0",
  homepage: "https://arlcoin.io/build",
  author: "Alazdg <team@arlcoin.io>",
  repository: {
    type: "git",
    url: "git+https://github.com/armanalabsai/arlcoin.io.git",
    directory: "packages/mcp",
  },
  type: "module",
  bin: { "arl-mcp": "./mcp/src/cli.js" },
  main: "./mcp/src/index.js",
  types: "./mcp/src/index.d.ts",
  exports: { ".": { types: "./mcp/src/index.d.ts", default: "./mcp/src/index.js" } },
  engines: { node: ">=22" },
  dependencies: source.dependencies,
};
writeFileSync(join(out, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
copyFileSync(join(here, "README.md"), join(out, "README.md"));
process.stdout.write(`built ${pkg.name}@${pkg.version} in dist/package\n`);
