// Registers the ARL testnet operator's demo AI service on the ERC-8004 IdentityRegistry of Base
// Sepolia: priced in testnet ARL, paid to the operator, settled by the operator (the app's
// /api/operator/settle). Runs once; does nothing when the operator already owns an agent.
//
//   ARL_OPERATOR_KEY=0x… node scripts/seed-sepolia.ts <rpc-url> <base-sepolia.json> [app-url]
//
// On a local fork, ARL_OPERATOR_UNLOCKED=1 sends as the (impersonated) operator without a key.

import { readFileSync } from "node:fs";

import { createWalletClient, http, parseAbi, publicActions, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import {
  IDENTITY_REGISTRY,
  encodeRegistration,
  identityRegistryAbi,
  validateService,
} from "../lib/registry.ts";

const [rpcUrl, recordPath, appUrl = "https://app.arlcoin.io"] = process.argv.slice(2);
if (!rpcUrl || !recordPath) {
  console.error("usage: seed-sepolia.ts <rpc-url> <base-sepolia.json> [app-url]");
  process.exit(2);
}
const record = JSON.parse(readFileSync(recordPath, "utf8")) as {
  operator: Address;
  contracts: { ARLToken: { address: Address } };
};
const key = process.env.ARL_OPERATOR_KEY;
const account =
  process.env.ARL_OPERATOR_UNLOCKED === "1"
    ? record.operator
    : key && /^0x[0-9a-fA-F]{64}$/.test(key)
      ? privateKeyToAccount(key as Hex)
      : undefined;
if (!account) throw new Error("set ARL_OPERATOR_KEY (or ARL_OPERATOR_UNLOCKED=1 on a fork)");
const address = typeof account === "string" ? account : account.address;
if (address.toLowerCase() !== record.operator.toLowerCase())
  throw new Error("the key is not the recorded operator");

const client = createWalletClient({
  account,
  chain: { ...baseSepolia, rpcUrls: { default: { http: [rpcUrl] } } },
  transport: http(rpcUrl),
}).extend(publicActions);
if ((await client.getChainId()) !== 84_532) throw new Error(`${rpcUrl} is not Base Sepolia`);

const owned = await client.readContract({
  address: IDENTITY_REGISTRY,
  abi: parseAbi(["function balanceOf(address owner) view returns (uint256)"]),
  functionName: "balanceOf",
  args: [address],
});
if (owned > 0n) {
  console.log("the operator already owns an agent on the registry: nothing to do");
  process.exit(0);
}

const uri = encodeRegistration(
  validateService({
    name: "ARL demo AI service",
    description:
      "The ARL testnet operator's demo service: usage priced per 1,000 model tokens and paid in testnet ARL over x402 upto. Testnet only.",
    endpoint: `${appUrl}/api/operator/settle`,
    terms: {
      network: "eip155:84532",
      asset: record.contracts.ARLToken.address,
      unitPrice: "1000000000000000",
      unit: "1,000 tokens",
      payTo: address,
      facilitator: address,
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
console.log(`demo service registered on the ERC-8004 IdentityRegistry (${hash})`);
