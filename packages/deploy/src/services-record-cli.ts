// Usage:
//   node packages/deploy/src/services-record-cli.ts <run.json> <rpc-url> <record.json>
//
// Writes the record of the Base Mainnet network services from the run file of
// `DeployMainnetServices` (the dry-run file the Deploy screen signed). Every check runs on chain
// first and nothing is written unless all pass:
// - the run creates exactly ComputePayment and ARLStakingRewards, with code at both addresses;
// - ComputePayment is paid in the Base Mainnet ARL token and holds no stream;
// - staking and rewards are both ARL, the reward period is 180 days, and only the Community &
//   Staking Safe (at least two signatures) can fund it.
// Base Mainnet (8453) only. Exit codes: 0 written, 3 a check failed, 1 could not run, 2 usage.

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

import { createPublicClient, getAddress, http, parseAbi, type Address } from "viem";

const ARL_TOKEN: Address = "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4";
const COMMUNITY_STAKING_SAFE: Address = "0xfF12597A671ebAF0cAe37999EE659e03c4f444B5";
const REWARDS_DURATION = 180n * 24n * 60n * 60n;

const [runPath, rpc, outPath] = process.argv.slice(2);
if (!runPath || !rpc || !outPath) {
  process.stderr.write("usage: services-record-cli.ts <run.json> <rpc-url> <record.json>\n");
  process.exit(2);
}

const abi = parseAbi([
  "function paymentToken() view returns (address)",
  "function streamCounter() view returns (uint256)",
  "function stakingToken() view returns (address)",
  "function rewardsToken() view returns (address)",
  "function rewardsDistribution() view returns (address)",
  "function rewardsDuration() view returns (uint256)",
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

const run = JSON.parse(readFileSync(runPath, "utf8")) as { transactions?: RunTx[] };
const client = createPublicClient({ transport: http(rpc) });
const chainId = await client.getChainId();
if (chainId !== 8453) {
  process.stderr.write(`services record rejected: chain ${String(chainId)} is not Base Mainnet\n`);
  process.exit(3);
}

const created = (run.transactions ?? []).filter((t) => t.transactionType === "CREATE");
const find = (name: string) => {
  const t = created.find((x) => x.contractName === name);
  return t?.contractAddress ? getAddress(t.contractAddress) : undefined;
};
const payment = find("ComputePayment");
const staking = find("ARLStakingRewards");
check(
  payment !== undefined && staking !== undefined && created.length === 2,
  "run creates ComputePayment and ARLStakingRewards only",
);
if (!payment || !staking) process.exit(3);

for (const [name, address] of [
  ["ComputePayment", payment],
  ["ARLStakingRewards", staking],
] as const) {
  const code = await client.getCode({ address });
  check(code !== undefined && code.length > 2, `${name} has code at ${address}`);
}
const read = <T>(address: Address, functionName: (typeof abi)[number]["name"]) =>
  client.readContract({ address, abi, functionName }) as unknown as Promise<T>;

check(
  getAddress(await read<Address>(payment, "paymentToken")) === ARL_TOKEN,
  "compute payment is paid in ARL",
);
check((await read<bigint>(payment, "streamCounter")) === 0n, "compute payment holds no stream");
check(getAddress(await read<Address>(staking, "stakingToken")) === ARL_TOKEN, "staking is ARL");
check(getAddress(await read<Address>(staking, "rewardsToken")) === ARL_TOKEN, "rewards are ARL");
const duration = await read<bigint>(staking, "rewardsDuration");
check(duration === REWARDS_DURATION, `reward period is 180 days (${String(duration)} s)`);
const distribution = getAddress(await read<Address>(staking, "rewardsDistribution"));
check(
  distribution === COMMUNITY_STAKING_SAFE,
  `reward funder is the Community & Staking Safe (${distribution})`,
);
const owners = (await read<Address[]>(distribution, "getOwners")).map((o) => getAddress(o));
const threshold = await read<bigint>(distribution, "getThreshold");
check(
  owners.length >= 2 && threshold >= 2n,
  `Community & Staking Safe: ${String(threshold)} of ${String(owners.length)}`,
);

if (failures.length > 0) {
  process.stderr.write(`services record not written: ${String(failures.length)} check(s) failed\n`);
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
  computePayment: payment,
  staking,
  rewardsDistribution: distribution,
  rewardsDistributionOwners: owners,
  rewardsDistributionThreshold: Number(threshold),
  rewardsDurationSeconds: Number(duration),
  block: String(await client.getBlockNumber()),
};
writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`services record written: ${outPath}\n`);
