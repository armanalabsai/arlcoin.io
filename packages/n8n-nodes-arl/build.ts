// Builds dist/ for n8n: each node and credential as one CommonJS file with viem bundled in, so
// the published package has no runtime dependencies, plus the icon next to each.
//
//   node build.ts

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
rmSync(dist, { recursive: true, force: true });

const entries = [
  ["src/nodes/Arl/Arl.node.ts", "dist/nodes/Arl/Arl.node.js"],
  ["src/credentials/ArlWalletApi.credentials.ts", "dist/credentials/ArlWalletApi.credentials.js"],
] as const;
for (const [from, to] of entries) {
  execFileSync(
    "npx",
    [
      "--yes",
      "esbuild@0.25.11",
      from,
      "--bundle",
      "--platform=node",
      "--format=cjs",
      "--target=node20",
      "--log-level=warning",
      `--outfile=${to}`,
    ],
    { cwd: here, stdio: "inherit", shell: process.platform === "win32" },
  );
  copyFileSync(join(here, "src/nodes/Arl/arl.svg"), join(here, dirname(to), "arl.svg"));
}
// dist/ is CommonJS (n8n loads nodes with require), whatever the package type says.
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, "package.json"), '{ "type": "commonjs" }\n');
process.stdout.write("built dist/ (nodes/Arl, credentials)\n");
