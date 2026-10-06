// Usage: node packages/deploy/src/tokenlist-cli.ts <out.json> <chainId>=<token> [...]
//
// Writes the ARL token list, e.g. after the Base Mainnet deployment:
//   node packages/deploy/src/tokenlist-cli.ts apps/web/public/tokenlist.json 8453=0x...
// Use the token address from the verified deployment manifest only.

import { writeFileSync } from "node:fs";
import process from "node:process";

import { TokenListError, buildTokenList } from "./tokenlist.ts";

const [outPath, ...pairs] = process.argv.slice(2);
if (!outPath || pairs.length === 0) {
  process.stderr.write("usage: tokenlist-cli.ts <out.json> <chainId>=<token> [...]\n");
  process.exit(2);
}

try {
  const tokens: Record<number, string> = {};
  for (const pair of pairs) {
    const [chain, address] = pair.split("=");
    tokens[Number(chain)] = address ?? "";
  }
  const list = buildTokenList(tokens, new Date());
  writeFileSync(outPath, `${JSON.stringify(list, null, 2)}\n`);
  process.stdout.write(`token list written: ${outPath} (${String(list.tokens.length)} token)\n`);
} catch (error) {
  const message = error instanceof TokenListError ? error.message : String(error);
  process.stderr.write(`token list rejected: ${message}\n`);
  process.exit(1);
}
