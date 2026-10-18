// Runs a spec end to end (inputs, container, output hashes) and decides a validator's vote: the
// recomputed result hash must equal the deliverable the provider submitted, and the result must
// meet the spec's own acceptance conditions. Providers use `execute` to produce the deliverable.

import { constants } from "node:fs";
import { chmod, mkdtemp, open, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Hex } from "viem";

import type { ContainerRunner } from "./docker.ts";
import { inside, materialize, sha256, type Fetcher } from "./inputs.ts";
import {
  acceptance,
  RESULT_VERSION,
  resultHash,
  type OutputEntry,
  type ResultManifest,
} from "./result.ts";
import { specHash, type ReexecSpec } from "./spec.ts";

export interface Execution {
  result: ResultManifest;
  hash: Hex;
}

/** Makes a tree writable by the job's unprivileged user. */
async function openUp(dir: string): Promise<void> {
  await chmod(dir, 0o777);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) await openUp(p);
    else if (entry.isFile()) await chmod(p, 0o666);
  }
}

/** SHA-256 of a declared output, or null if it is missing or not a regular file (no symlinks). */
async function outputEntry(outDir: string, path: string): Promise<OutputEntry> {
  const full = inside(outDir, path);
  // One handle for the check and the read, so the file cannot be swapped in between; O_NOFOLLOW
  // refuses a symlink where the platform supports it.
  let handle;
  try {
    handle = await open(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    return { path, sha256: null };
  }
  try {
    if (!(await handle.stat()).isFile()) return { path, sha256: null };
    return { path, sha256: sha256(await handle.readFile()) };
  } finally {
    await handle.close();
  }
}

export interface ExecuteOptions {
  runner: ContainerRunner;
  fetcher: Fetcher;
  /** Parent of the temporary work and output directories. */
  tmpRoot?: string;
}

export async function execute(spec: ReexecSpec, opts: ExecuteOptions): Promise<Execution> {
  const root = await mkdtemp(join(opts.tmpRoot ?? tmpdir(), "arl-reexec-"));
  try {
    const work = await mkdtemp(join(root, "work-"));
    const out = await mkdtemp(join(root, "out-"));
    await materialize(spec, work, opts.fetcher);
    await openUp(work);
    await openUp(out);
    const status = await opts.runner.run(spec, work, out);
    const outputs: OutputEntry[] = [];
    for (const p of [...spec.outputs].sort()) outputs.push(await outputEntry(out, p));
    const result: ResultManifest = {
      version: RESULT_VERSION,
      spec_hash: specHash(spec),
      exit_code: status.exitCode,
      timed_out: status.timedOut,
      outputs,
    };
    return { result, hash: resultHash(result) };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export interface Decision {
  approve: boolean;
  reason: string;
  /** The validator's own result hash (the vote's evidence). */
  evidence: Hex;
  result: ResultManifest | null;
}

const ZERO: Hex = `0x${"0".repeat(64)}`;

/** Re-executes `spec` and decides the vote on `deliverable`, given the job's on-chain specHash. */
export async function decide(
  spec: ReexecSpec,
  committedSpecHash: Hex,
  deliverable: Hex,
  opts: ExecuteOptions,
): Promise<Decision> {
  if (specHash(spec).toLowerCase() !== committedSpecHash.toLowerCase()) {
    return {
      approve: false,
      reason: "spec does not match the job's specHash",
      evidence: ZERO,
      result: null,
    };
  }
  const { result, hash } = await execute(spec, opts);
  if (hash.toLowerCase() !== deliverable.toLowerCase()) {
    return {
      approve: false,
      reason: `result ${hash} differs from deliverable ${deliverable}`,
      evidence: hash,
      result,
    };
  }
  const ok = acceptance(spec, result);
  return { approve: ok.ok, reason: ok.reason, evidence: hash, result };
}
