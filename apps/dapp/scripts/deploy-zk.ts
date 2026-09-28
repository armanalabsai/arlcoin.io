// Creates the demo poll group on the local anonymous-signal contract with three development identities (secrets 11, 22 and 33; development only).
// Anvil development account 0 deploys and is the group admin; the local node unlocks it.
//
//   node scripts/deploy-zk.ts [rpc-url]
// Runs after contracts/zk-script/DevZk.s.sol.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { commitment, createGroup } from "@arl/zk";
import { createWalletClient, http, publicActions } from "viem";
import type { Abi, Hex } from "viem";
import { foundry } from "viem/chains";

const rpcUrl = process.argv[2] ?? process.env.ARL_RPC_URL ?? "http://127.0.0.1:8545";
const contracts = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "contracts");
const OPERATOR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function artifact(file: string, name: string): { abi: Abi; bytecode: Hex } {
  const a = JSON.parse(readFileSync(join(contracts, "out", file, `${name}.json`), "utf8")) as {
    abi: Abi;
    bytecode: { object: Hex };
  };
  return { abi: a.abi, bytecode: a.bytecode.object };
}

const client = createWalletClient({
  account: OPERATOR,
  chain: { ...foundry, rpcUrls: { default: { http: [rpcUrl] } } },
  transport: http(rpcUrl),
}).extend(publicActions);
if ((await client.getChainId()) !== 31_337) throw new Error(`${rpcUrl} is not a local Anvil chain`);

// Deployed by contracts/zk-script/DevZk.s.sol (forge links the verifier's libraries).
const { signal } = JSON.parse(
  readFileSync(join(contracts, "deploy", "deployments", "31337-zk.json"), "utf8"),
) as { signal: Hex };

const members = [11n, 22n, 33n].map(commitment);
const group = createGroup(members);
const { abi } = artifact("ARLAnonymousSignal.sol", "ARLAnonymousSignal");
const hash = await client.writeContract({
  address: signal,
  abi,
  functionName: "createGroupWithMembers",
  args: [members, group.root],
});
await client.waitForTransactionReceipt({ hash });

console.log(`anonymous signals at ${signal}: demo group 0 with 3 members`);
