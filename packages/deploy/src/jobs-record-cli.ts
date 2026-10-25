// Usage:
//   node packages/deploy/src/jobs-record-cli.ts <run.json> <rpc-url> <record.json>
//
// Writes the record of the jobs escrow and the verified evaluator from the run file of
// `DeployMainnetVerifiedJobs` (the dry-run file the Deploy screen signed). Every check runs on
// chain first and nothing is written unless all pass:
// - each creation in the run is an ARLJobs or ARLVerifiedEvaluator with code at its address (a run
//   that creates only the evaluator, for an escrow already on chain, takes the escrow from it);
// - the escrow is paid in the Base Mainnet ARL token;
// - the evaluator belongs to that escrow, stakes in the same token and writes to the canonical
//   ERC-8004 registries;
// - the arbiter is a Safe with at least two signatures of at least three owners.
// Base Mainnet (8453) only. Exit codes: 0 written, 3 a check failed, 1 could not run, 2 usage.

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

import { createPublicClient, getAddress, http, parseAbi, type Address } from "viem";

const ARL_TOKEN: Address = "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4";
const IDENTITY: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const REPUTATION: Address = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";

const [runPath, rpc, outPath] = process.argv.slice(2);
if (!runPath || !rpc || !outPath) {
  process.stderr.write("usage: jobs-record-cli.ts <run.json> <rpc-url> <record.json>\n");
  process.exit(2);
}

const abi = parseAbi([
  "function paymentToken() view returns (address)",
  "function jobs() view returns (address)",
  "function stakeToken() view returns (address)",
  "function arbiter() view returns (address)",
  "function minChallengeWindow() view returns (uint64)",
  "function minBond() view returns (uint96)",
  "function identity() view returns (address)",
  "function reputation() view returns (address)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
]);

interface RunTx {
  transactionType?: string;
  contractName?: string;
  contractAddress?: string;
}

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  process.stdout.write(`  ${ok ? "ok  " : "FAIL"}  ${what}\n`);
  if (!ok) failures.push(what);
};

const run = JSON.parse(readFileSync(runPath, "utf8")) as { chain?: number; transactions?: RunTx[] };
const client = createPublicClient({ transport: http(rpc) });
const chainId = await client.getChainId();
if (chainId !== 8453) {
  process.stderr.write(`jobs record rejected: chain ${String(chainId)} is not Base Mainnet\n`);
  process.exit(3);
}

const created = (run.transactions ?? []).filter((t) => t.transactionType === "CREATE");
const find = (name: string) => {
  const t = created.find((x) => x.contractName === name);
  return t?.contractAddress ? getAddress(t.contractAddress) : undefined;
};
const evaluator = find("ARLVerifiedEvaluator");
const createdJobs = find("ARLJobs");
check(
  evaluator !== undefined && created.length === (createdJobs === undefined ? 1 : 2),
  createdJobs === undefined
    ? "run creates ARLVerifiedEvaluator only"
    : "run creates ARLJobs and ARLVerifiedEvaluator only",
);
if (!evaluator) process.exit(3);
const jobs =
  createdJobs ??
  getAddress(
    (await client.readContract({
      address: evaluator,
      abi,
      functionName: "jobs",
    })) as Address,
  );

for (const [name, address] of [
  ["ARLJobs", jobs],
  ["ARLVerifiedEvaluator", evaluator],
] as const) {
  const code = await client.getCode({ address });
  check(code !== undefined && code.length > 2, `${name} has code at ${address}`);
}
const read = <T>(address: Address, functionName: (typeof abi)[number]["name"]) =>
  client.readContract({ address, abi, functionName }) as unknown as Promise<T>;

const token = getAddress(await read<Address>(jobs, "paymentToken"));
check(token === ARL_TOKEN, `escrow is paid in ARL (${token})`);
check(
  getAddress(await read<Address>(evaluator, "jobs")) === jobs,
  "evaluator belongs to the escrow",
);
check(
  getAddress(await read<Address>(evaluator, "stakeToken")) === ARL_TOKEN,
  "evaluator stakes in ARL",
);
check(
  getAddress(await read<Address>(evaluator, "identity")) === IDENTITY,
  "ERC-8004 identity registry",
);
check(
  getAddress(await read<Address>(evaluator, "reputation")) === REPUTATION,
  "ERC-8004 reputation registry",
);
const arbiter = getAddress(await read<Address>(evaluator, "arbiter"));
const owners = (await read<Address[]>(arbiter, "getOwners")).map((o) => getAddress(o));
const threshold = await read<bigint>(arbiter, "getThreshold");
check(
  owners.length >= 3 && threshold >= 2n,
  `arbiter Safe ${arbiter}: ${String(threshold)} of ${String(owners.length)}`,
);
const minChallengeWindow = await read<bigint>(evaluator, "minChallengeWindow");
const minBond = await read<bigint>(evaluator, "minBond");

if (failures.length > 0) {
  process.stderr.write(`jobs record not written: ${String(failures.length)} check(s) failed\n`);
  process.exit(3);
}
const clientVersion: string = await client
  .request({ method: "web3_clientVersion" } as never)
  .then((v) => String(v))
  .catch(() => "");
const record = {
  // A local Anvil fork answers chain 8453 too; its record is a rehearsal, not evidence.
  network: clientVersion.toLowerCase().includes("anvil")
    ? "base-mainnet-fork-rehearsal"
    : "base-mainnet",
  chainId,
  token: ARL_TOKEN,
  jobs,
  evaluator,
  arbiter,
  arbiterOwners: owners,
  arbiterThreshold: Number(threshold),
  minChallengeWindowSeconds: Number(minChallengeWindow),
  minBondWei: minBond.toString(),
  identityRegistry: IDENTITY,
  reputationRegistry: REPUTATION,
  block: (await client.getBlockNumber()).toString(),
};
writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`jobs record written: ${outPath}\n`);
