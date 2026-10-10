// Verified deployment records.
//
// `forge script --broadcast` runs a script, and so knows its addresses, before it sends anything;
// a phone-signed dry run is sent outside Foundry altogether. Neither can know what reached the
// chain, so no deploy script writes a record any more. This module writes it instead, from
// Foundry's run file (`broadcast/<Script>/<chain>/[dry-run/]run-latest.json`), and only after
// every contract the run created is checked on chain:
// - each transaction succeeded (when the file has receipts) and is from one sender;
// - each created address holds the expected code: the ARL build's runtime code (immutables
//   masked, as in bytecode.ts), or the Safe v1.5.0 proxy code;
// - each contract carries the values its constructor was given (read through its getters), and
//   each Safe has exactly the owners and threshold of its signed setup.
// Base Sepolia (84532) and Base Mainnet (8453) only. A local Anvil node (a plain 31337 chain or a
// fork of either network) is accepted only with `localAnvil` for the rehearsal, and such a record is
// stamped as one. Nothing is written unless every check passes, and an existing record is replaced
// only by an atomic rename of a complete, verified one.
//
// On-chain reads use viem (MIT). Nothing here signs or sends a transaction.

import { createHash } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

import {
  concat,
  createPublicClient,
  decodeAbiParameters,
  decodeFunctionData,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  getContractAddress,
  http,
  isAddress,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

import { compareRuntime, type Artifact } from "./bytecode.ts";

export const VERIFIED_SCHEMA = "arl-verified-record/1";
export const TESTNET_CHAIN_ID = 84532;
export const MAINNET_CHAIN_ID = 8453;
export const LOCAL_CHAIN_ID = 31337;

/** The public networks a record may be written for, and how such a record is stamped. */
const PUBLIC_NETWORKS: Partial<
  Record<
    number,
    {
      label: string;
      stamp: "base-sepolia" | "base-mainnet";
      forkStamp: "base-sepolia-fork-rehearsal" | "base-mainnet-fork-rehearsal";
    }
  >
> = {
  [TESTNET_CHAIN_ID]: {
    label: "Base Sepolia",
    stamp: "base-sepolia",
    forkStamp: "base-sepolia-fork-rehearsal",
  },
  [MAINNET_CHAIN_ID]: {
    label: "Base Mainnet",
    stamp: "base-mainnet",
    forkStamp: "base-mainnet-fork-rehearsal",
  },
};

export const RECORD_KINDS = ["safes", "arl", "compute-payment", "distributor"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/** ARL builds a record can check. */
export type ArtifactName =
  "ARLToken" | "ARLVestingWallet" | "ARLTimelock" | "ARLMerkleDistributor" | "ComputePayment";

/** The Safe roles in the order `CreateSafes` creates them (`CreateSafes.roles()`). */
export const SAFE_ROLES = [
  "founder",
  "investors",
  "strategicPartnerships",
  "treasury",
  "guardian",
  "publicLaunch",
  "communityStaking",
  "ecosystemGrowth",
  "liquidity",
  "team",
  "earlyUsers",
  "grantsBugBounty",
] as const;

/** Canonical Safe v1.5.0 contracts on Base Sepolia, as pinned in CreateSafes and ARLDeployPlan. */
export const SAFE_V150 = {
  factory: "0x14F2982D601c9458F93bd70B218933A6f8165e7b",
  factoryCodeHash: "0x967dae4cda22b0c9ef7f31b010bdc1ceb0af9904b0c3dc060b5302e4c18a4529",
  singletons: {
    "0xFf51A5898e281Db6DfC7855790607438dF2ca44b":
      "0xdda019cbd7c867a533a2a86e5c53434fdc50b13122b5a5ddb4a8df61b31c20f2",
    "0xEdd160fEBBD92E350D4D398fb636302fccd67C7e":
      "0x180193227186ccb85316c94db1f0d156ed932b14712cfaac78901899178572dc",
  } as Record<string, Hex>,
  proxyCodeHash: "0x4e381985ca68b3e5d27b4425fa581c19cf33146d3f887a3cfca96f55528ea46f",
} as const;

const MAX_SUPPLY = 21_000_000n * 10n ** 18n;

export class RecordError extends Error {
  override name = "RecordError";
}

// ---------------------------------------------------------------- chain access

/** The reads the checks need, all at one block (a fake in tests). */
export interface ChainReader {
  chainId(): Promise<number>;
  clientVersion(): Promise<string>;
  blockNumber(): Promise<bigint>;
  code(address: Address, block: bigint): Promise<Hex>;
  /** `eth_call`; without `to` it simulates a contract creation and returns the runtime code. */
  call(request: { to?: Address; data: Hex }, block: bigint): Promise<Hex>;
  storageAt(address: Address, slot: Hex, block: bigint): Promise<Hex>;
}

const blockTag = (b: bigint): Hex => `0x${b.toString(16)}`;

export function rpcReader(rpcUrl: string): ChainReader {
  const client = createPublicClient({ transport: http(rpcUrl) });
  const request = async (method: string, params: unknown[]): Promise<string> =>
    String(await client.request({ method, params } as never));
  return {
    chainId: async () => Number(BigInt(await request("eth_chainId", []))),
    clientVersion: () => request("web3_clientVersion", []),
    blockNumber: async () => BigInt(await request("eth_blockNumber", [])),
    code: async (address, block) =>
      ((await request("eth_getCode", [address, blockTag(block)])) || "0x") as Hex,
    call: async (r, block) => (await request("eth_call", [r, blockTag(block)])) as Hex,
    storageAt: async (address, slot, block) =>
      (await request("eth_getStorageAt", [address, slot, blockTag(block)])) as Hex,
  };
}

// ---------------------------------------------------------------- run file

export interface RunTransaction {
  hash: Hex | null;
  transactionType: string;
  contractName: string | null;
  contractAddress: Address | null;
  additionalContracts: { transactionType: string; address: Address; initCode: Hex }[];
  transaction: {
    from: Address;
    to: Address | null;
    input: Hex;
    nonce: bigint;
    chainId: number | undefined;
  };
}

export interface RunReceipt {
  transactionHash: Hex;
  status: number;
  contractAddress: Address | null;
  blockNumber: bigint;
}

export interface RunFile {
  chain: number;
  transactions: RunTransaction[];
  receipts: RunReceipt[];
}

const isHex = (v: unknown): v is Hex => typeof v === "string" && /^0x([0-9a-fA-F]{2})*$/.test(v);
const isHexNumber = (v: unknown): v is string =>
  typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v);

/** Reads a Foundry run file; anything malformed is an error, never a guess. */
export function parseRunFile(json: unknown): RunFile {
  const bad = (m: string): never => {
    throw new RecordError(`run file: ${m}`);
  };
  const run = json as { chain?: unknown; transactions?: unknown; receipts?: unknown };
  if (typeof run.chain !== "number") bad("no chain id");
  if (!Array.isArray(run.transactions) || run.transactions.length === 0) bad("no transactions");
  const addr = (v: unknown, f: string): Address =>
    typeof v === "string" && isAddress(v, { strict: false })
      ? getAddress(v)
      : bad(`${f} is not an address`);
  const transactions = (run.transactions as Record<string, unknown>[]).map(
    (t, i): RunTransaction => {
      const f = `transaction ${String(i + 1)}`;
      const tx = (t.transaction ?? {}) as Record<string, unknown>;
      if (!isHex(tx.input)) bad(`${f}: no input`);
      if (!isHexNumber(tx.nonce)) bad(`${f}: no nonce`);
      const extra = Array.isArray(t.additionalContracts) ? t.additionalContracts : [];
      return {
        hash: isHex(t.hash) ? t.hash : null,
        transactionType:
          typeof t.transactionType === "string" ? t.transactionType : bad(`${f}: no type`),
        contractName: typeof t.contractName === "string" ? t.contractName : null,
        contractAddress: t.contractAddress
          ? addr(t.contractAddress, `${f}: contract address`)
          : null,
        additionalContracts: (extra as Record<string, unknown>[]).map((c) => ({
          transactionType: String(c.transactionType),
          address: addr(c.address, `${f}: created address`),
          initCode: isHex(c.initCode) ? c.initCode : bad(`${f}: no init code`),
        })),
        transaction: {
          from: addr(tx.from, `${f}: sender`),
          to: tx.to ? addr(tx.to, `${f}: target`) : null,
          input: tx.input as Hex,
          nonce: BigInt(tx.nonce as string),
          chainId: isHexNumber(tx.chainId) ? Number(BigInt(tx.chainId)) : undefined,
        },
      };
    },
  );
  const receipts = (Array.isArray(run.receipts) ? run.receipts : []).map(
    (r: Record<string, unknown>, i) => {
      const f = `receipt ${String(i + 1)}`;
      if (!isHex(r.transactionHash)) bad(`${f}: no transaction hash`);
      if (!isHexNumber(r.status)) bad(`${f}: no status`);
      if (!isHexNumber(r.blockNumber)) bad(`${f}: no block number`);
      return {
        transactionHash: r.transactionHash as Hex,
        status: Number(BigInt(r.status as string)),
        contractAddress: r.contractAddress
          ? addr(r.contractAddress, `${f}: contract address`)
          : null,
        blockNumber: BigInt(r.blockNumber as string),
      };
    },
  );
  return { chain: run.chain as number, transactions, receipts };
}

// ---------------------------------------------------------------- checks

export interface RecordFinding {
  check: string;
  ok: boolean;
  detail: string;
}

export interface VerifiedStamp {
  schema: typeof VERIFIED_SCHEMA;
  kind: RecordKind;
  chainId: number;
  /** Every check was made at this block. */
  block: string;
  /** SHA-256 of the run file the record was built from. */
  runFile: string;
  checks: number;
  /** Only "base-sepolia" and "base-mainnet" are records of a public network; the others are rehearsals. */
  network:
    | "base-sepolia"
    | "base-mainnet"
    | "base-sepolia-fork-rehearsal"
    | "base-mainnet-fork-rehearsal"
    | "local-anvil-rehearsal";
}

export interface VerifyOptions {
  kind: RecordKind;
  artifacts: Partial<Record<ArtifactName, Artifact>>;
  /** Accept a local Anvil chain (31337), for the rehearsal only. */
  localAnvil?: boolean | undefined;
  /** The claim list of a distributor run: its root must match, its total goes in the record. */
  distribution?: { merkleRoot: string; total: string } | undefined;
  /** SHA-256 of the run file, stamped into the record. */
  runFileHash: string;
}

export interface VerifyResult {
  ok: boolean;
  findings: RecordFinding[];
  /** The record, only when every check passed. */
  record?: Record<string, unknown> & { verified: VerifiedStamp };
}

/** A read or expected value as text (scalars, or JSON for anything else). */
const show = (v: unknown): string =>
  typeof v === "string" || typeof v === "number" || typeof v === "bigint" || typeof v === "boolean"
    ? String(v)
    : JSON.stringify(v, (_k, x: unknown) => (typeof x === "bigint" ? x.toString() : x));

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

const readAbi = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function owner() view returns (address)",
  "function cliffStart() view returns (uint64)",
  "function start() view returns (uint256)",
  "function duration() view returns (uint256)",
  "function getMinDelay() view returns (uint256)",
  "function paymentToken() view returns (address)",
  "function token() view returns (address)",
  "function merkleRoot() view returns (bytes32)",
  "function claimEnd() view returns (uint64)",
  "function returnTo() view returns (address)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function proxyCreationCode() pure returns (bytes)",
]);
type ReadFn = (typeof readAbi)[number]["name"];
const factoryAbi = parseAbi([
  "function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address)",
]);
const setupAbi = parseAbi([
  "function setup(address[] owners, uint256 threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
]);
const CONSTRUCTOR_ARGS: Record<
  ArtifactName,
  readonly { type: string; components?: { type: string }[] }[]
> = {
  ARLToken: [
    { type: "tuple", components: Array.from({ length: 11 }, () => ({ type: "address" })) },
  ],
  ARLVestingWallet: [
    { type: "address" },
    { type: "uint64" },
    { type: "uint64" },
    { type: "uint64" },
  ],
  ARLTimelock: [
    { type: "uint256" },
    { type: "address[]" },
    { type: "address[]" },
    { type: "address" },
  ],
  ARLMerkleDistributor: [
    { type: "address" },
    { type: "bytes32" },
    { type: "uint64" },
    { type: "address" },
  ],
  ComputePayment: [{ type: "address" }],
};

class Checker {
  readonly findings: RecordFinding[] = [];
  readonly reader: ChainReader;
  readonly block: bigint;
  constructor(reader: ChainReader, block: bigint) {
    this.reader = reader;
    this.block = block;
  }

  add(check: string, ok: boolean, detail: string): boolean {
    this.findings.push({ check, ok, detail });
    return ok;
  }

  get ok(): boolean {
    return this.findings.length > 0 && this.findings.every((f) => f.ok);
  }

  /** A getter; a revert (wrong or missing contract) is a failed read, not an error. */
  async read(address: Address, functionName: ReadFn): Promise<unknown> {
    try {
      const data = await this.reader.call(
        { to: address, data: encodeFunctionData({ abi: readAbi, functionName }) },
        this.block,
      );
      return decodeFunctionResult({ abi: readAbi, functionName, data });
    } catch {
      return undefined;
    }
  }

  async expectRead(label: string, address: Address, fn: ReadFn, want: unknown): Promise<void> {
    const got = await this.read(address, fn);
    this.add(
      `${label} ${fn}()`,
      got !== undefined && show(got).toLowerCase() === show(want).toLowerCase(),
      got === undefined ? "call failed" : `${show(got)} (expected ${show(want)})`,
    );
  }

  /**
   * A creation of an ARL build: the planned address, the build's creation code, the build's
   * runtime code on chain. Returns the decoded constructor arguments.
   */
  async created(
    label: string,
    tx: RunTransaction,
    name: ArtifactName,
    artifact: Artifact | undefined,
  ): Promise<readonly unknown[] | undefined> {
    if (!artifact) {
      this.add(`${label} build`, false, `no ${name} build to compare with (run forge build)`);
      return undefined;
    }
    const address = getContractAddress({ from: tx.transaction.from, nonce: tx.transaction.nonce });
    this.add(
      `${label} address`,
      same(address, tx.contractAddress),
      `${address} from sender nonce ${tx.transaction.nonce.toString()}`,
    );
    const input = tx.transaction.input.toLowerCase();
    const creation = artifact.creation.toLowerCase();
    if (
      !this.add(
        `${label} creation code is the ${name} build`,
        input.startsWith(creation),
        `${String((input.length - 2) / 2)} bytes sent`,
      )
    ) {
      return undefined;
    }
    const code = await this.reader.code(address, this.block);
    const r = compareRuntime(artifact, code);
    this.add(
      `${label} runtime code is the ${name} build`,
      r.match,
      r.reason ?? `${String((code.length - 2) / 2)} bytes at ${address}`,
    );
    try {
      return decodeAbiParameters(
        CONSTRUCTOR_ARGS[name] as never,
        `0x${input.slice(creation.length)}`,
      );
    } catch {
      this.add(`${label} constructor arguments`, false, "cannot be decoded");
      return undefined;
    }
  }
}

/** Checks a run file against the chain; returns the record only if every check passed. */
export async function verifyRun(
  run: RunFile,
  reader: ChainReader,
  opts: VerifyOptions,
): Promise<VerifyResult> {
  const chainId = await reader.chainId();
  if (chainId !== run.chain) {
    throw new RecordError(
      `RPC chain ${String(chainId)} is not the run file's chain ${String(run.chain)}`,
    );
  }
  // A local Anvil node, whether a plain chain (31337) or a fork of Base Sepolia (84532) or Base
  // Mainnet (8453), is a rehearsal: accepted only with the flag, and stamped so it can never pass
  // for the real network.
  const anvil = /^anvil\//i.test(await reader.clientVersion());
  const publicName = PUBLIC_NETWORKS[chainId];
  if (chainId === LOCAL_CHAIN_ID) {
    if (!opts.localAnvil)
      throw new RecordError(
        "chain 31337: local Anvil is accepted only for the rehearsal (--local-anvil)",
      );
    if (!anvil) throw new RecordError("chain 31337 is not served by Anvil");
  } else if (!publicName) {
    throw new RecordError(
      `chain ${String(chainId)} refused: verified records are written for Base Sepolia (84532) and Base Mainnet (8453) only`,
    );
  } else if (anvil && !opts.localAnvil) {
    throw new RecordError(
      `chain ${String(chainId)} is served by a local Anvil fork, not ${publicName.label}: pass --local-anvil for a rehearsal`,
    );
  }
  const block = await reader.blockNumber();
  const c = new Checker(reader, block);

  // Transactions: one sender, this chain, and, in a broadcast file, a successful receipt each.
  const sender = run.transactions[0]?.transaction.from;
  const broadcast = run.receipts.length > 0 || run.transactions.some((t) => t.hash);
  for (const [i, t] of run.transactions.entries()) {
    const n = `transaction ${String(i + 1)}`;
    c.add(`${n} sender`, same(t.transaction.from, sender), t.transaction.from);
    if (t.transaction.chainId !== undefined)
      c.add(`${n} chain`, t.transaction.chainId === chainId, String(t.transaction.chainId));
    if (!broadcast) continue;
    const receipt = run.receipts.find((r) => same(r.transactionHash, t.hash));
    if (
      !c.add(
        `${n} mined`,
        !!receipt,
        receipt
          ? `block ${receipt.blockNumber.toString()}`
          : "no receipt: the broadcast did not complete",
      )
    )
      continue;
    c.add(
      `${n} succeeded`,
      receipt?.status === 1,
      receipt?.status === 1 ? "status 1" : "status 0: the transaction failed",
    );
  }

  let fields: Record<string, unknown> | undefined;
  if (opts.kind === "safes") fields = await checkSafes(c, run, chainId);
  else if (opts.kind === "arl") fields = await checkArl(c, run, opts);
  else if (opts.kind === "compute-payment") fields = await checkComputePayment(c, run, opts);
  else fields = await checkDistributor(c, run, opts);

  if (!c.ok || !fields) return { ok: false, findings: c.findings };
  const verified: VerifiedStamp = {
    schema: VERIFIED_SCHEMA,
    kind: opts.kind,
    chainId,
    block: block.toString(),
    runFile: opts.runFileHash,
    checks: c.findings.length,
    network:
      chainId === LOCAL_CHAIN_ID || !publicName
        ? "local-anvil-rehearsal"
        : anvil
          ? publicName.forkStamp
          : publicName.stamp,
  };
  return { ok: true, findings: c.findings, record: { chainId, ...fields, verified } };
}

const creates = (run: RunFile) => run.transactions.filter((t) => t.transactionType === "CREATE");

function expectOnly(c: Checker, run: RunFile, names: string[]): RunTransaction[] | undefined {
  const got = run.transactions.map((t) => `${t.transactionType}:${t.contractName ?? "?"}`);
  const want = names.map((n) => `CREATE:${n}`);
  const ok = got.length === want.length && got.every((g, i) => g === want[i]);
  c.add("run creates exactly the expected contracts", ok, got.join(", "));
  return ok ? creates(run) : undefined;
}

async function checkArl(c: Checker, run: RunFile, opts: VerifyOptions) {
  const txs = expectOnly(c, run, [
    "ARLVestingWallet",
    "ARLVestingWallet",
    "ARLTimelock",
    "ARLToken",
  ]);
  if (!txs) return undefined;
  const [v1, v2, tl, tk] = txs as [RunTransaction, RunTransaction, RunTransaction, RunTransaction];
  const a = opts.artifacts;
  const vest1 = await c.created("vesting wallet 1", v1, "ARLVestingWallet", a.ARLVestingWallet);
  const vest2 = await c.created("vesting wallet 2", v2, "ARLVestingWallet", a.ARLVestingWallet);
  const lock = await c.created("timelock", tl, "ARLTimelock", a.ARLTimelock);
  const token = await c.created("token", tk, "ARLToken", a.ARLToken);
  if (!vest1 || !vest2 || !lock || !token) return undefined;

  // The token's constructor names the vesting wallets and the treasury (ARLToken.Recipients).
  const r = token[0] as readonly Address[];
  const investors = r[6];
  const partnerships = r[3];
  const treasury = r[7];
  const created = {
    [getAddress(v1.contractAddress ?? "0x0")]: vest1,
    [getAddress(v2.contractAddress ?? "0x0")]: vest2,
  };
  c.add(
    "token mints the investors allocation to a created vesting wallet",
    !!investors && !!created[getAddress(investors)],
    String(investors),
  );
  c.add(
    "token mints the partnerships allocation to the other one",
    !!partnerships && !!created[getAddress(partnerships)] && !same(investors, partnerships),
    String(partnerships),
  );
  c.add(
    "token mints the treasury allocation to the created timelock",
    same(treasury, tl.contractAddress),
    String(treasury),
  );

  const tokenAddr = tk.contractAddress as Address;
  await c.expectRead("token", tokenAddr, "totalSupply", MAX_SUPPLY);
  await c.expectRead("token", tokenAddr, "symbol", "ARL");
  await c.expectRead("token", tokenAddr, "decimals", 18);
  for (const [tx, args] of [
    [v1, vest1],
    [v2, vest2],
  ] as const) {
    const at = tx.contractAddress as Address;
    const [beneficiary, cliffStart, cliffEnd, vestingEnd] = args as [
      Address,
      bigint,
      bigint,
      bigint,
    ];
    const label = same(at, investors) ? "investors vesting" : "partnerships vesting";
    await c.expectRead(label, at, "owner", beneficiary);
    await c.expectRead(label, at, "cliffStart", cliffStart);
    await c.expectRead(label, at, "start", cliffEnd);
    await c.expectRead(label, at, "duration", vestingEnd - cliffEnd);
  }
  await c.expectRead("timelock", tl.contractAddress as Address, "getMinDelay", lock[0]);
  return {
    deployer: tk.transaction.from,
    token: tokenAddr,
    investorsVesting: investors ? getAddress(investors) : undefined,
    partnershipsVesting: partnerships ? getAddress(partnerships) : undefined,
    timelock: tl.contractAddress,
  };
}

/** First block at which `address` has code (for a dry-run file, which has no receipts). */
async function creationBlock(c: Checker, address: Address): Promise<bigint> {
  let lo = 0n;
  let hi = c.block;
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if ((await c.reader.code(address, mid)).length > 2) hi = mid;
    else lo = mid;
  }
  return hi;
}

async function checkComputePayment(c: Checker, run: RunFile, opts: VerifyOptions) {
  const txs = expectOnly(c, run, ["ComputePayment"]);
  if (!txs) return undefined;
  const tx = txs[0] as RunTransaction;
  const args = await c.created(
    "ComputePayment",
    tx,
    "ComputePayment",
    opts.artifacts.ComputePayment,
  );
  if (!args) return undefined;
  const at = tx.contractAddress as Address;
  await c.expectRead("ComputePayment", at, "paymentToken", args[0]);
  if (!c.ok) return undefined;
  const receipt = run.receipts.find((r) => same(r.transactionHash, tx.hash));
  return {
    blockNumber: Number(receipt ? receipt.blockNumber : await creationBlock(c, at)),
    paymentToken: getAddress(args[0] as Address),
    ComputePayment: at,
  };
}

async function checkDistributor(c: Checker, run: RunFile, opts: VerifyOptions) {
  const txs = expectOnly(c, run, ["ARLMerkleDistributor"]);
  if (!txs) return undefined;
  const tx = txs[0] as RunTransaction;
  const args = await c.created(
    "distributor",
    tx,
    "ARLMerkleDistributor",
    opts.artifacts.ARLMerkleDistributor,
  );
  if (!args) return undefined;
  const [token, root, claimEnd, returnTo] = args as [Address, Hex, bigint, Address];
  const at = tx.contractAddress as Address;
  await c.expectRead("distributor", at, "token", token);
  await c.expectRead("distributor", at, "merkleRoot", root);
  await c.expectRead("distributor", at, "claimEnd", claimEnd);
  await c.expectRead("distributor", at, "returnTo", returnTo);
  const list = opts.distribution;
  c.add("claim list given", !!list, list ? "yes" : "pass the claim list with --distribution");
  if (!list) return undefined;
  c.add("claim list root is the deployed root", same(list.merkleRoot, root), list.merkleRoot);
  c.add("claim list total", /^\d+$/.test(list.total), list.total);
  return {
    distributor: at,
    merkleRoot: root,
    total: list.total,
    claimEnd: Number(claimEnd),
    returnTo: getAddress(returnTo),
  };
}

async function checkSafes(c: Checker, run: RunFile, chainId: number) {
  const n = SAFE_ROLES.length;
  const calls = run.transactions.filter((t) => t.transactionType === "CALL");
  if (
    !c.add(
      `run creates exactly ${String(n)} Safes`,
      calls.length === n && run.transactions.length === n,
      `${String(run.transactions.length)} transactions`,
    )
  ) {
    return undefined;
  }
  const factory = calls[0]?.transaction.to ?? null;
  // Both public networks carry the canonical Safe v1.5.0 contracts at the same addresses.
  const canonical = chainId !== LOCAL_CHAIN_ID;
  if (!factory) {
    c.add("Safe factory", false, "no target");
    return undefined;
  }
  const factoryCode = await c.reader.code(factory, c.block);
  if (canonical) {
    c.add(
      "Safe factory is canonical v1.5.0",
      same(factory, SAFE_V150.factory) && keccak256(factoryCode) === SAFE_V150.factoryCodeHash,
      factory,
    );
  } else {
    c.add("Safe factory has code", factoryCode.length > 2, factory);
  }
  const creationCode = (await c.read(factory, "proxyCreationCode")) as Hex | undefined;
  c.add(
    "Safe factory proxy creation code",
    !!creationCode,
    creationCode ? `${String((creationCode.length - 2) / 2)} bytes` : "call failed",
  );

  const safes: Record<string, Address> = {};
  let singleton: Address | undefined;
  for (const [i, tx] of calls.entries()) {
    const role = SAFE_ROLES[i] as string;
    const label = `${role} Safe`;
    c.add(
      `${label} goes through the same factory`,
      same(tx.transaction.to, factory),
      String(tx.transaction.to),
    );
    let decoded: {
      singleton: Address;
      initializer: Hex;
      saltNonce: bigint;
      owners: readonly Address[];
      threshold: bigint;
    };
    try {
      const f = decodeFunctionData({ abi: factoryAbi, data: tx.transaction.input });
      const [s, initializer, saltNonce] = f.args;
      const setup = decodeFunctionData({ abi: setupAbi, data: initializer });
      decoded = {
        singleton: getAddress(s),
        initializer,
        saltNonce,
        owners: setup.args[0],
        threshold: setup.args[1],
      };
    } catch {
      c.add(`${label} transaction`, false, "not a Safe creation with a Safe setup");
      continue;
    }
    singleton ??= decoded.singleton;
    c.add(`${label} singleton`, same(decoded.singleton, singleton), decoded.singleton);
    const created = tx.additionalContracts.filter((a) => a.transactionType === "CREATE2");
    const proxy = created[0];
    if (
      !c.add(
        `${label} created one proxy`,
        created.length === 1 && !!proxy,
        `${String(created.length)} created`,
      ) ||
      !proxy
    )
      continue;
    if (creationCode) {
      const initCode = concat([
        creationCode,
        encodeAbiParameters([{ type: "address" }], [decoded.singleton]),
      ]);
      c.add(
        `${label} proxy init code`,
        same(initCode, proxy.initCode),
        "factory creation code + singleton",
      );
      const salt = keccak256(
        encodePacked(["bytes32", "uint256"], [keccak256(decoded.initializer), decoded.saltNonce]),
      );
      const address = getContractAddress({
        opcode: "CREATE2",
        from: factory,
        salt,
        bytecode: initCode,
      });
      c.add(`${label} address`, same(address, proxy.address), address);
    }
    const code = await c.reader.code(proxy.address, c.block);
    if (
      !c.add(
        `${label} has code`,
        code.length > 2,
        `${String((code.length - 2) / 2)} bytes at ${proxy.address}`,
      )
    )
      continue;
    if (canonical) {
      c.add(
        `${label} runs the Safe v1.5.0 proxy code`,
        keccak256(code) === SAFE_V150.proxyCodeHash,
        keccak256(code),
      );
    } else {
      let expected: Hex | undefined;
      try {
        expected = await c.reader.call({ data: proxy.initCode }, c.block);
      } catch {
        expected = undefined;
      }
      c.add(
        `${label} runs the factory's proxy code`,
        !!expected && same(expected, code),
        `${String((code.length - 2) / 2)} bytes`,
      );
    }
    const slot0 = await c.reader.storageAt(proxy.address, `0x${"0".repeat(64)}`, c.block);
    c.add(
      `${label} points to its singleton`,
      BigInt(slot0 === "0x" ? "0x0" : slot0) === BigInt(decoded.singleton),
      slot0,
    );
    const owners = (await c.read(proxy.address, "getOwners")) as readonly Address[] | undefined;
    const want = decoded.owners.map((o) => o.toLowerCase()).sort();
    const got = (owners ?? []).map((o) => o.toLowerCase()).sort();
    c.add(
      `${label} owners`,
      !!owners && got.length === want.length && got.every((o, k) => o === want[k]),
      owners ? owners.join(",") : "call failed",
    );
    await c.expectRead(label, proxy.address, "getThreshold", decoded.threshold);
    safes[role] = proxy.address;
  }
  if (!singleton) return undefined;
  const singletonCode = await c.reader.code(singleton, c.block);
  if (canonical) {
    const want = Object.entries(SAFE_V150.singletons).find(([a]) => same(a, singleton))?.[1];
    c.add(
      "Safe singleton is canonical v1.5.0",
      !!want && keccak256(singletonCode) === want,
      singleton,
    );
  } else {
    c.add("Safe singleton has code", singletonCode.length > 2, singleton);
  }
  return { singleton, safes };
}

// ---------------------------------------------------------------- consumers and output

/** A record a consumer may rely on: stamped by this tool, for this kind and chain. */
export function requireVerified(record: unknown, kind: RecordKind): void {
  const r = record as { chainId?: unknown; verified?: Partial<VerifiedStamp> };
  const v = r.verified;
  if (!v || v.schema !== VERIFIED_SCHEMA || v.kind !== kind || v.chainId !== r.chainId) {
    throw new RecordError(
      `not a verified ${kind} record: create it with record-cli.ts ${kind} from the run file`,
    );
  }
}

export const sha256 = (data: string | Buffer): string =>
  createHash("sha256").update(data).digest("hex");

/**
 * Writes the record by an atomic rename. The previous record (if any) stays untouched until the
 * complete new one replaces it; a failed write leaves no partial file.
 */
export function writeRecordAtomically(path: string, record: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${String(process.pid)}-${String(Date.now())}`;
  try {
    writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
    renameSync(tmp, path);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}
