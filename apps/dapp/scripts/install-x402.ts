// Installs the canonical Permit2 and x402UptoPermit2Proxy code (fixtures/x402-code.json) at their
// canonical addresses on the local Anvil chain, then checks the code hashes. Local Anvil only.
//
//   node scripts/install-x402.ts [rpc-url]

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { keccak256 } from "viem";
import type { Hex } from "viem";

const rpcUrl = process.argv[2] ?? process.env.ARL_RPC_URL ?? "http://127.0.0.1:8545";
const fixture = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "x402-code.json");

interface Code {
  address: Hex;
  codeHash: Hex;
  code: Hex;
}

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

if ((await rpc("eth_chainId", [])) !== "0x7a69")
  throw new Error(`${rpcUrl} is not a local Anvil chain`);

const contracts = JSON.parse(readFileSync(fixture, "utf8")) as Record<string, Code | string>;
for (const [name, entry] of Object.entries(contracts)) {
  if (typeof entry === "string") continue;
  if (keccak256(entry.code) !== entry.codeHash)
    throw new Error(`${name}: fixture code does not match its hash`);
  await rpc("anvil_setCode", [entry.address, entry.code]);
  const onChain = (await rpc("eth_getCode", [entry.address, "latest"])) as Hex;
  if (keccak256(onChain) !== entry.codeHash)
    throw new Error(`${name}: installed code hash mismatch`);
  console.log(`${name} installed at ${entry.address}`);
}
