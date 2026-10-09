// Fails if the compiled ARL token exposes any function beyond ERC-20, EIP-2612 permit
// (with its EIP-5267 domain getter), ERC20Burnable (`burn`, `burnFrom`) and MAX_SUPPLY. Guards
// against a mint, owner or admin function being added.
import { readFileSync } from "node:fs";
import process from "node:process";
import { URL } from "node:url";

const artifact = JSON.parse(
  readFileSync(new URL("../contracts/out/ARLToken.sol/ARLToken.json", import.meta.url), "utf8"),
);

const expected = [
  "DOMAIN_SEPARATOR()",
  "MAX_SUPPLY()",
  "allowance(address,address)",
  "approve(address,uint256)",
  "balanceOf(address)",
  "burn(uint256)",
  "burnFrom(address,uint256)",
  "decimals()",
  "eip712Domain()",
  "name()",
  "nonces(address)",
  "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
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
process.stdout.write(
  `ARLToken ABI OK: ${actual.length} functions, all ERC-20 / ERC20Burnable / EIP-2612.\n`,
);
