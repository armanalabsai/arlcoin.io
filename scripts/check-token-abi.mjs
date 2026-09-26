// Fails if the compiled ARL token exposes any function beyond the ERC-20 interface and
// MAX_SUPPLY. Guards against a mint, burn, owner or admin function being added.
import { readFileSync } from "node:fs";
import process from "node:process";
import { URL } from "node:url";

const artifact = JSON.parse(
  readFileSync(new URL("../contracts/out/ARLToken.sol/ARLToken.json", import.meta.url), "utf8"),
);

const expected = [
  "MAX_SUPPLY()",
  "allowance(address,address)",
  "approve(address,uint256)",
  "balanceOf(address)",
  "decimals()",
  "name()",
  "symbol()",
  "totalSupply()",
  "transfer(address,uint256)",
  "transferFrom(address,address,uint256)",
];

const actual = Object.keys(artifact.methodIdentifiers).sort();
const unexpected = actual.filter((sig) => !expected.includes(sig));
const missing = expected.filter((sig) => !actual.includes(sig));

if (unexpected.length > 0 || missing.length > 0) {
  process.stderr.write(
    `ARLToken ABI mismatch.\n  unexpected: ${unexpected.join(", ") || "none"}\n  missing: ${missing.join(", ") || "none"}\n`,
  );
  process.exit(1);
}
process.stdout.write(`ARLToken ABI OK: ${actual.length} functions, all ERC-20.\n`);
