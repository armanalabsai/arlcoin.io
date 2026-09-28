// Installs canonical third-party contracts on the local Anvil chain at their canonical addresses:
// Permit2 and the x402 upto proxy (fixtures/x402-code.json), and the ERC-8004 IdentityRegistry
// with its implementation and initialised storage (fixtures/erc8004-code.json). Code hashes are
// checked before and after. Local Anvil only.
//
//   node scripts/install-canonical.ts [rpc-url]

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { keccak256 } from "viem";
import type { Hex } from "viem";

const rpcUrl = process.argv[2] ?? process.env.ARL_RPC_URL ?? "http://127.0.0.1:8545";
const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

interface Code {
  address: Hex;
  codeHash: Hex;
  code: Hex;
  storage?: Record<Hex, Hex>;
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

for (const file of ["x402-code.json", "erc8004-code.json"]) {
  const contracts = JSON.parse(readFileSync(join(fixtures, file), "utf8")) as Record<
    string,
    Code | string
  >;
  for (const [name, entry] of Object.entries(contracts)) {
    if (typeof entry === "string") continue;
    if (keccak256(entry.code) !== entry.codeHash)
      throw new Error(`${name}: fixture code does not match its hash`);
    await rpc("anvil_setCode", [entry.address, entry.code]);
    for (const [slot, value] of Object.entries(entry.storage ?? {})) {
      await rpc("anvil_setStorageAt", [entry.address, slot, value]);
    }
    const onChain = (await rpc("eth_getCode", [entry.address, "latest"])) as Hex;
    if (keccak256(onChain) !== entry.codeHash)
      throw new Error(`${name}: installed code hash mismatch`);
    console.log(`${name} installed at ${entry.address}`);
  }
}
