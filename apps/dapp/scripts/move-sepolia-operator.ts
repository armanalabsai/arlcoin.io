// Moves the Base Sepolia testnet operator role from the deploying account to a new account whose
// key only the owner holds (it is set as ARL_OPERATOR_KEY in the host, never here):
//
//   1. points the demo AI service (ERC-8004 agent) at the new operator: payTo and facilitator
//   2. transfers the agent to the new operator
//   3. sends the old account's remaining Base Sepolia ETH to the new operator, keeping gas
//
//   ARL_OPERATOR_KEY=<old key> node scripts/move-sepolia-operator.ts <rpc-url> <base-sepolia.json> \
//     <agent-id> <new-operator> [app-url]
//
// No ARL contract gives the operator a role, so nothing else moves.

import { readFileSync } from "node:fs";

import {
  createWalletClient,
  getAddress,
  http,
  isAddress,
  parseAbi,
  publicActions,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import {
  IDENTITY_REGISTRY,
  encodeRegistration,
  identityRegistryAbi,
  parseRegistration,
  validateService,
} from "../lib/registry.ts";

const [rpcUrl, recordPath, agent, next, appUrl = "https://app.arlcoin.io"] = process.argv.slice(2);
if (!rpcUrl || !recordPath || !agent || !next || !isAddress(next) || !/^[0-9]+$/.test(agent)) {
  console.error(
    "usage: move-sepolia-operator.ts <rpc-url> <base-sepolia.json> <agent-id> <new-operator> [app-url]",
  );
  process.exit(2);
}
const key = process.env.ARL_OPERATOR_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
  throw new Error("set ARL_OPERATOR_KEY to the old operator key");
const account = privateKeyToAccount(key as Hex);
const record = JSON.parse(readFileSync(recordPath, "utf8")) as {
  contracts: { ARLToken: { address: Address } };
};
const newOperator = getAddress(next);
const agentId = BigInt(agent);

const client = createWalletClient({
  account,
  chain: { ...baseSepolia, rpcUrls: { default: { http: [rpcUrl] } } },
  transport: http(rpcUrl),
}).extend(publicActions);
if ((await client.getChainId()) !== 84_532) throw new Error(`${rpcUrl} is not Base Sepolia`);
if ((await client.getCode({ address: newOperator })) !== undefined)
  throw new Error("the new operator must be an account, not a contract");

const erc721 = parseAbi([
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);
const owner = await client.readContract({
  address: IDENTITY_REGISTRY,
  abi: erc721,
  functionName: "ownerOf",
  args: [agentId],
});
const current = parseRegistration(
  await client.readContract({
    address: IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: "tokenURI",
    args: [agentId],
  }),
);
if (!current.ok) throw new Error(`agent ${agent} has no valid ARL registration`);

if (getAddress(owner) === getAddress(account.address)) {
  const uri = encodeRegistration(
    validateService({
      name: current.value.name,
      description: current.value.description,
      endpoint: `${appUrl}/api/operator/settle`,
      terms: {
        network: current.value.terms.network,
        asset: record.contracts.ARLToken.address,
        unitPrice: current.value.terms.unitPrice.toString(),
        unit: current.value.terms.unit,
        payTo: newOperator,
        facilitator: newOperator,
      },
    }),
  );
  const set = await client.writeContract({
    address: IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: "setAgentURI",
    args: [agentId, uri],
  });
  await client.waitForTransactionReceipt({ hash: set });
  console.log(`agent ${agent} now pays and is settled by ${newOperator} (${set})`);
  const moved = await client.writeContract({
    address: IDENTITY_REGISTRY,
    abi: erc721,
    functionName: "transferFrom",
    args: [account.address, newOperator, agentId],
  });
  await client.waitForTransactionReceipt({ hash: moved });
  console.log(`agent ${agent} transferred to ${newOperator} (${moved})`);
} else if (getAddress(owner) !== newOperator) {
  throw new Error(`agent ${agent} is owned by ${owner}, neither the old nor the new operator`);
}

// Keep enough for one transfer; send the rest.
const balance = await client.getBalance({ address: account.address });
const gasPrice = await client.getGasPrice();
const keep = 21_000n * gasPrice * 3n;
if (balance > keep) {
  const hash = await client.sendTransaction({ to: newOperator, value: balance - keep });
  await client.waitForTransactionReceipt({ hash });
  console.log(`sent ${String(balance - keep)} wei to ${newOperator} (${hash})`);
}
