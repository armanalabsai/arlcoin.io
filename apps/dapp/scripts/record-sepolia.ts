// Writes the Base Sepolia record that scripts/generate-contracts.ts reads: every ARL contract the
// app uses on Base Sepolia, with the block it was deployed in (history reads start there).
//
//   node scripts/record-sepolia.ts <ecosystem.json> <signal.json> <operator> <out.json>
//
// The ecosystem and signal records are written by contracts/script/DeploySepoliaEcosystem.s.sol
// and contracts/zk-script/DeploySepoliaSignal.s.sol; their deployment blocks are read from the
// Foundry broadcast receipts. The token and vesting wallets were deployed on 2026-10-04
// (docs/audit-evidence.md); their blocks are fixed here.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getAddress, isAddress } from "viem";

const [ecosystemPath, signalPath, operator, outPath] = process.argv.slice(2);
if (!ecosystemPath || !signalPath || !operator || !outPath || !isAddress(operator)) {
  console.error("usage: record-sepolia.ts <ecosystem.json> <signal.json> <operator> <out.json>");
  process.exit(2);
}
const contracts = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "contracts");

const TOKEN = {
  address: "0x244312b619127B6458154F3467eFD7c87CD28500",
  deployedOnBlock: 47_688_347,
};
const INVESTORS_VESTING = {
  address: "0x830e35CdF48F8F30F83d1DBE8431f02a7BE9dCcE",
  deployedOnBlock: 47_688_312,
};
const PARTNERSHIPS_VESTING = "0x02c7692918C98EC710970D390b08f247A76D5A37";

const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const ecosystem = read<{ chainId: number; token: string; staking: string; jobs: string }>(
  ecosystemPath,
);
const signal = read<{ chainId: number; verifier: string; signal: string }>(signalPath);
if (ecosystem.chainId !== 84_532 || signal.chainId !== 84_532)
  throw new Error("not Base Sepolia records");
if (getAddress(ecosystem.token) !== TOKEN.address)
  throw new Error("the ecosystem uses another token");

/** The block each contract was created in, from a Foundry broadcast file. */
function blocks(script: string): Map<string, number> {
  const run = read<{ receipts: { contractAddress?: string | null; blockNumber: string }[] }>(
    join(contracts, "broadcast", script, "84532", "run-latest.json"),
  );
  const out = new Map<string, number>();
  for (const r of run.receipts)
    if (r.contractAddress) out.set(getAddress(r.contractAddress), Number(BigInt(r.blockNumber)));
  return out;
}
const eco = blocks("DeploySepoliaEcosystem.s.sol");
const zk = blocks("DeploySepoliaSignal.s.sol");
const at = (map: Map<string, number>, address: string) => {
  const block = map.get(getAddress(address));
  if (block === undefined) throw new Error(`no broadcast receipt for ${address}`);
  return { address: getAddress(address), deployedOnBlock: block };
};

const record = {
  chainId: 84_532,
  operator: getAddress(operator),
  contracts: {
    ARLToken: TOKEN,
    ARLVestingWallet: INVESTORS_VESTING,
    ARLStakingRewards: at(eco, ecosystem.staking),
    ARLJobs: at(eco, ecosystem.jobs),
    ARLAnonymousSignal: at(zk, signal.signal),
  },
  verifier: at(zk, signal.verifier),
  vestingWallets: {
    investors: INVESTORS_VESTING.address,
    strategicPartnerships: PARTNERSHIPS_VESTING,
  },
};
writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
console.log(`Base Sepolia record written: ${outPath}`);
