// Reproducible build and deployment proof.
//
// The contracts are compiled without a metadata hash (`bytecode_hash = "none"`,
// `cbor_metadata = false`), so the same source, compiler and settings always produce the same
// bytecode. This module:
// - records the hash of every deployable contract's creation and runtime code in a committed
//   manifest, so CI proves that a clean build reproduces exactly the reviewed bytecode;
// - compares the runtime code at a deployed address with a local build. Immutable values are
//   the only bytes that differ per deployment; they are masked for the comparison, required to
//   be identical at every place the compiler wrote them, and then checked through the
//   contracts' own getters against the plan.
//
// Hashing and on-chain reads use viem (MIT).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createPublicClient,
  hashDomain,
  http,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

import type { DeploymentRecord } from "./manifest.ts";
import type { DeployPlan } from "./plan.ts";

export const BYTECODE_SCHEMA = "arl-bytecode-manifest/1";

/** Contracts that are deployed on a public network, in the order they are reported. */
export const DEPLOYABLE = [
  "ARLToken",
  "ARLVestingWallet",
  "ARLTimelock",
  "ARLMerkleDistributor",
  "ARLStakingRewards",
  "ARLJobs",
  "ComputePayment",
] as const;
export type Deployable = (typeof DEPLOYABLE)[number];

export interface Artifact {
  name: string;
  creation: Hex;
  /** Runtime code with every immutable slot left as zeros, as the compiler emits it. */
  runtime: Hex;
  /** One entry per immutable variable: every byte range the compiler wrote it to. */
  immutables: { start: number; length: number }[][];
}

export interface BytecodeManifest {
  schema: typeof BYTECODE_SCHEMA;
  compiler: { solc: string; evmVersion: string; optimizerRuns: number; viaIR: boolean };
  contracts: Record<string, { creationHash: Hex; runtimeHash: Hex; runtimeSize: number }>;
}

export class BytecodeError extends Error {
  override name = "BytecodeError";
}

interface ForgeArtifact {
  bytecode: { object: string };
  deployedBytecode: {
    object: string;
    immutableReferences?: Record<string, { start: number; length: number }[]>;
  };
}

const hex = (v: string): Hex => (v.startsWith("0x") ? v : `0x${v}`) as Hex;

export function readArtifact(outDir: string, name: string): Artifact {
  const a = JSON.parse(
    readFileSync(join(outDir, `${name}.sol`, `${name}.json`), "utf8"),
  ) as ForgeArtifact;
  const runtime = hex(a.deployedBytecode.object);
  if (runtime.length <= 2) throw new BytecodeError(`${name}: no runtime code in the artifact`);
  return {
    name,
    creation: hex(a.bytecode.object),
    runtime,
    immutables: Object.values(a.deployedBytecode.immutableReferences ?? {}),
  };
}

const bytes = (h: Hex) => Buffer.from(h.slice(2), "hex");

/** Zeros every immutable range, so that code from any deployment hashes like the build. */
export function maskImmutables(artifact: Artifact, code: Hex): Hex {
  const b = bytes(code);
  for (const ref of artifact.immutables)
    for (const r of ref) b.fill(0, r.start, r.start + r.length);
  return `0x${b.toString("hex")}`;
}

export interface RuntimeMatch {
  match: boolean;
  reason?: string;
  /** The value of each immutable as deployed (one 32-byte word per variable). */
  immutableValues: Hex[];
}

/** Whether on-chain runtime code is exactly this build, apart from its immutable values. */
export function compareRuntime(artifact: Artifact, onchain: Hex): RuntimeMatch {
  const code = bytes(onchain);
  const built = bytes(artifact.runtime);
  if (code.length === 0)
    return { match: false, reason: "no code at the address", immutableValues: [] };
  if (code.length !== built.length) {
    return {
      match: false,
      reason: `runtime size ${String(code.length)} ≠ build ${String(built.length)}`,
      immutableValues: [],
    };
  }
  if (!bytes(maskImmutables(artifact, onchain)).equals(built)) {
    return { match: false, reason: "runtime code differs from the build", immutableValues: [] };
  }
  const values: Hex[] = [];
  for (const ref of artifact.immutables) {
    const [first, ...rest] = ref.map((r) => code.subarray(r.start, r.start + r.length));
    if (!first || rest.some((v) => !v.equals(first))) {
      return {
        match: false,
        reason: "an immutable differs between its copies",
        immutableValues: [],
      };
    }
    values.push(`0x${first.toString("hex")}`);
  }
  return { match: true, immutableValues: values };
}

interface FoundryProfile {
  solc: string;
  evmVersion: string;
  optimizerRuns: number;
  viaIR: boolean;
}

/** The compiler settings that determine the bytecode, read from `foundry.toml`. */
export function readCompilerSettings(foundryToml: string): FoundryProfile {
  const t = readFileSync(foundryToml, "utf8");
  const section = t.split(/^\[/m).find((s) => s.startsWith("profile.default]")) ?? "";
  const get = (key: string) =>
    new RegExp(`^${key}\\s*=\\s*"?([^"\\n]+)"?`, "m").exec(section)?.[1]?.trim();
  const solc = get("solc_version");
  const evmVersion = get("evm_version");
  const runs = get("optimizer_runs");
  if (!solc || !evmVersion || !runs)
    throw new BytecodeError("foundry.toml: compiler settings not found");
  if (get("bytecode_hash") !== "none" || get("cbor_metadata") !== "false") {
    throw new BytecodeError("foundry.toml: builds must omit the metadata hash to be reproducible");
  }
  return { solc, evmVersion, optimizerRuns: Number(runs), viaIR: get("via_ir") === "true" };
}

export function buildManifest(outDir: string, compiler: FoundryProfile): BytecodeManifest {
  const contracts: BytecodeManifest["contracts"] = {};
  for (const name of DEPLOYABLE) {
    const a = readArtifact(outDir, name);
    contracts[name] = {
      creationHash: keccak256(a.creation),
      runtimeHash: keccak256(a.runtime),
      runtimeSize: (a.runtime.length - 2) / 2,
    };
  }
  return { schema: BYTECODE_SCHEMA, compiler, contracts };
}

/** Differences between a committed manifest and a fresh build; empty when they agree. */
export function diffManifest(committed: BytecodeManifest, built: BytecodeManifest): string[] {
  const out: string[] = [];
  if ((committed.schema as unknown) !== BYTECODE_SCHEMA)
    out.push(`schema ${committed.schema as string}`);
  for (const k of ["solc", "evmVersion", "optimizerRuns", "viaIR"] as const) {
    if (committed.compiler[k] !== built.compiler[k]) {
      out.push(`compiler.${k}: ${String(committed.compiler[k])} ≠ ${String(built.compiler[k])}`);
    }
  }
  for (const name of new Set([
    ...Object.keys(committed.contracts),
    ...Object.keys(built.contracts),
  ])) {
    const c = committed.contracts[name];
    const b = built.contracts[name];
    if (!c || !b)
      out.push(`${name}: ${c ? "missing from the build" : "missing from the manifest"}`);
    else
      for (const k of ["creationHash", "runtimeHash", "runtimeSize"] as const)
        if (c[k] !== b[k]) out.push(`${name}.${k}: ${String(c[k])} ≠ ${String(b[k])}`);
  }
  return out;
}

// ---------------------------------------------------------------- deployed contracts

export interface DeploymentFinding {
  contract: string;
  address: string;
  check: string;
  ok: boolean;
  detail: string;
}

const tokenAbi = parseAbi([
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function name() view returns (string)",
]);
const vestingAbi = parseAbi([
  "function start() view returns (uint256)",
  "function duration() view returns (uint256)",
  "function cliffStart() view returns (uint64)",
  "function owner() view returns (address)",
]);

/**
 * Proves a deployment record: every address runs this build's code, and every immutable value
 * the code carries is the planned one (read through the contracts' getters).
 */
export async function verifyDeployment(
  outDir: string,
  plan: DeployPlan,
  deployment: DeploymentRecord,
  rpcUrl: string,
): Promise<DeploymentFinding[]> {
  const client = createPublicClient({ transport: http(rpcUrl) });
  const chainId = await client.getChainId();
  if (chainId !== plan.chainId || deployment.chainId !== plan.chainId) {
    throw new BytecodeError(
      `RPC chain ${String(chainId)}, plan ${String(plan.chainId)} and deployment ${String(deployment.chainId)} must agree`,
    );
  }
  const blockNumber = await client.getBlockNumber();
  const findings: DeploymentFinding[] = [];
  const add = (contract: string, address: string, check: string, ok: boolean, detail: string) =>
    findings.push({ contract, address, check, ok, detail });

  const targets: [Deployable, string, string][] = [
    ["ARLToken", "token", deployment.token],
    ["ARLVestingWallet", "investors vesting", deployment.investorsVesting],
    ["ARLVestingWallet", "strategic partnerships vesting", deployment.partnershipsVesting],
    ["ARLTimelock", "treasury timelock", deployment.timelock],
  ];
  for (const [name, label, address] of targets) {
    const code = (await client.getCode({ address: address as Address, blockNumber })) ?? "0x";
    const r = compareRuntime(readArtifact(outDir, name), code);
    add(
      label,
      address,
      `runs the ${name} build`,
      r.match,
      r.reason ?? `${String((code.length - 2) / 2)} bytes`,
    );
  }

  // A getter that reverts (wrong contract at the address) is a failed check, not an error.
  const attempt = async <T>(call: Promise<T>): Promise<T | undefined> => {
    try {
      return await call;
    } catch {
      return undefined;
    }
  };
  const token = deployment.token as Address;
  const expectValue = <T>(
    contract: string,
    address: string,
    check: string,
    actual: T | undefined,
    ok: (v: T) => boolean,
  ) =>
    add(
      contract,
      address,
      check,
      actual !== undefined && ok(actual),
      actual === undefined ? "call reverted" : String(actual),
    );

  const expectedDomain = hashDomain({
    domain: {
      name: "ARL",
      version: "1",
      chainId: BigInt(chainId),
      verifyingContract: deployment.token as Address,
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
    },
  });
  expectValue(
    "token",
    deployment.token,
    "permit domain (name, version, chain, address)",
    await attempt(
      client.readContract({
        address: token,
        abi: tokenAbi,
        functionName: "DOMAIN_SEPARATOR",
        blockNumber,
      }),
    ),
    (d) => d === expectedDomain,
  );

  for (const [key, label, address] of [
    ["investors", "investors vesting", deployment.investorsVesting],
    ["strategicPartnerships", "strategic partnerships vesting", deployment.partnershipsVesting],
  ] as const) {
    const v = plan.vesting[key];
    expectValue(
      label,
      address,
      "cliff end (start)",
      await attempt(
        client.readContract({
          address: address as Address,
          abi: vestingAbi,
          functionName: "start",
          blockNumber,
        }),
      ),
      (x) => x === BigInt(v.cliffEnd),
    );
    expectValue(
      label,
      address,
      "linear duration",
      await attempt(
        client.readContract({
          address: address as Address,
          abi: vestingAbi,
          functionName: "duration",
          blockNumber,
        }),
      ),
      (x) => x === BigInt(v.vestingEnd - v.cliffEnd),
    );
    expectValue(
      label,
      address,
      "cliff start",
      await attempt(
        client.readContract({
          address: address as Address,
          abi: vestingAbi,
          functionName: "cliffStart",
          blockNumber,
        }),
      ),
      (x) => x === BigInt(v.cliffStart),
    );
    expectValue(
      label,
      address,
      "beneficiary",
      await attempt(
        client.readContract({
          address: address as Address,
          abi: vestingAbi,
          functionName: "owner",
          blockNumber,
        }),
      ),
      (x) => x.toLowerCase() === v.beneficiary.toLowerCase(),
    );
  }
  return findings;
}
