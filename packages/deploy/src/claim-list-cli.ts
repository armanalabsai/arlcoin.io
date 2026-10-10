// Usage: node packages/deploy/src/claim-list-cli.ts <distribution.json> <distributor> <token>
//          <rpc-url> <out.json>
//
// Writes the claim list the app serves (`apps/dapp/public/claims/<chainId>.json`) after reading
// the deployed distributor on chain: it must have code, the distribution's root, the given
// token, an open window and enough ARL to pay every claim. Exits non-zero and writes nothing
// otherwise. Read-only on chain.

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import process from "node:process";

import { createPublicClient, erc20Abi, http, type Address } from "viem";

import { buildClaimList, distributorReadAbi } from "./claim-list.ts";
import type { Distribution } from "./distribution.ts";

const [distributionPath, distributor, token, rpcUrl, outPath, ...rest] = process.argv.slice(2);
if (!distributionPath || !distributor || !token || !rpcUrl || !outPath || rest.length > 0) {
  process.stderr.write(
    "usage: claim-list-cli.ts <distribution.json> <distributor> <token> <rpc-url> <out.json>\n",
  );
  process.exit(2);
}

try {
  const distribution = JSON.parse(readFileSync(distributionPath, "utf8")) as Distribution;
  const client = createPublicClient({ transport: http(rpcUrl) });
  const blockNumber = await client.getBlockNumber();
  const at = { address: distributor as Address, abi: distributorReadAbi, blockNumber } as const;
  const [chainId, block, code] = await Promise.all([
    client.getChainId(),
    client.getBlock({ blockNumber }),
    client.getCode({ address: distributor as Address, blockNumber }),
  ]);
  const read = async <T>(call: Promise<T>, what: string): Promise<T> => {
    try {
      return await call;
    } catch {
      throw new Error(`distributor: ${what}() could not be read`);
    }
  };
  const list = buildClaimList(distribution, distributor, token, {
    chainId,
    code: code ?? "0x",
    token: await read(client.readContract({ ...at, functionName: "token" }), "token"),
    merkleRoot: await read(
      client.readContract({ ...at, functionName: "merkleRoot" }),
      "merkleRoot",
    ),
    claimEnd: await read(client.readContract({ ...at, functionName: "claimEnd" }), "claimEnd"),
    balance: await client.readContract({
      address: token as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [distributor as Address],
      blockNumber,
    }),
    now: block.timestamp,
  });
  const tmp = `${outPath}.tmp-${String(process.pid)}`;
  writeFileSync(tmp, `${JSON.stringify(list, null, 2)}\n`);
  renameSync(tmp, outPath);
  process.stdout.write(
    `claim list written: ${outPath} (chain ${String(chainId)}, ${String(distribution.count)} claims, block ${blockNumber.toString()})\n`,
  );
} catch (error) {
  process.stderr.write(
    `claim list not written: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
