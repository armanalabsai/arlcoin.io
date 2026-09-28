// Registers the local demo service on the ERC-8004 IdentityRegistry of the local Anvil chain:
// Anvil development account 3 (the demo service) registers, with account 4 as its facilitator.
// Development values only. Anvil unlocks its development accounts; no key is used.
//
//   node scripts/seed-network.ts [rpc-url] [deployment.json]

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createWalletClient, http, publicActions } from "viem";
import { foundry } from "viem/chains";

import {
  IDENTITY_REGISTRY,
  encodeRegistration,
  identityRegistryAbi,
  validateService,
} from "../lib/registry.ts";

const rpcUrl = process.argv[2] ?? process.env.ARL_RPC_URL ?? "http://127.0.0.1:8545";
const deploymentPath =
  process.argv[3] ??
  join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "contracts",
    "deploy",
    "deployments",
    "31337-dapp.json",
  );

const SERVICE = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"; // Anvil account 3
const FACILITATOR = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"; // Anvil account 4

const { token } = JSON.parse(readFileSync(deploymentPath, "utf8")) as { token: `0x${string}` };
const client = createWalletClient({
  account: SERVICE,
  chain: { ...foundry, rpcUrls: { default: { http: [rpcUrl] } } },
  transport: http(rpcUrl),
}).extend(publicActions);
if ((await client.getChainId()) !== 31_337) throw new Error(`${rpcUrl} is not a local Anvil chain`);

const uri = encodeRegistration(
  validateService({
    name: "Demo AI service",
    description: "A local test service: a chat model priced per 1,000 tokens. Development values.",
    endpoint: "http://127.0.0.1:8787/v1",
    terms: {
      network: "eip155:31337",
      asset: token,
      unitPrice: "1000000000000000",
      unit: "1,000 tokens",
      payTo: SERVICE,
      facilitator: FACILITATOR,
    },
  }),
);
const hash = await client.writeContract({
  address: IDENTITY_REGISTRY,
  abi: identityRegistryAbi,
  functionName: "register",
  args: [uri],
});
await client.waitForTransactionReceipt({ hash });
console.log("demo service registered on the ERC-8004 IdentityRegistry");
