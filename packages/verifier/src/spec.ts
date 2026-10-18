// arl-reexec/1: the job spec of a deterministic re-execution job (docs/reexecution-spec.md).
// Its keccak256 over canonical JSON is the `specHash` the client commits on-chain when it
// configures the job; a validator refuses to run a spec whose hash differs.

import type { Hex } from "viem";

import { canonicalHash } from "./canonical.ts";

export const SPEC_VERSION = "arl-reexec/1";

export interface GitInput {
  kind: "git";
  /** Where the checkout goes, relative to /work. */
  path: string;
  url: string;
  /** Full commit id (40 hex characters for SHA-1, 64 for SHA-256 repositories). */
  commit: string;
}

export interface FileInput {
  kind: "file";
  path: string;
  url: string;
  /** SHA-256 of the file, lowercase hex. */
  sha256: string;
}

export type Input = GitInput | FileInput;

export interface Limits {
  seconds: number;
  memory_mb: number;
  cpus: number;
}

export interface ReexecSpec {
  version: typeof SPEC_VERSION;
  /** Image reference pinned by digest: `name@sha256:<64 hex>`. */
  container_digest: string;
  inputs: Input[];
  /** argv: the first element is the entrypoint; no shell is involved. */
  command: string[];
  /** Working directory relative to /work. */
  workdir: string;
  /** The complete environment of the job (plus HOME=/tmp, set by every runner). */
  env: Record<string, string>;
  /** Files the job writes under /out; their hashes form the result. */
  outputs: string[];
  limits: Limits;
  /** If set, the job is accepted only with this exit code. */
  expected_exit_code?: number;
  /** If set, the job is accepted only if its result hash equals it. */
  expected_output_hash?: Hex;
  /** Digest of the verifier build that checks the job (for example this package's image). */
  verifier_digest: string;
}

export class SpecError extends Error {
  override name = "SpecError";
}

const IMAGE = /^[a-z0-9][a-z0-9._\-/:]*@sha256:[0-9a-f]{64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^([0-9a-f]{40}|[0-9a-f]{64})$/;
const HASH = /^0x[0-9a-f]{64}$/;
const ENV_KEY = /^[A-Z_][A-Z0-9_]*$/;
const PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const URL_SCHEMES = ["https:", "ipfs:"];

export const LIMIT_BOUNDS = {
  seconds: [1, 3600],
  memory_mb: [64, 65_536],
  cpus: [1, 64],
} as const;

const SPEC_KEYS = new Set([
  "version",
  "container_digest",
  "inputs",
  "command",
  "workdir",
  "env",
  "outputs",
  "limits",
  "expected_exit_code",
  "expected_output_hash",
  "verifier_digest",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function onlyKeys(v: Record<string, unknown>, allowed: readonly string[], what: string): void {
  for (const k of Object.keys(v)) {
    if (!allowed.includes(k)) throw new SpecError(`${what}: unknown field ${k}`);
  }
}

function str(v: unknown, what: string): string {
  if (typeof v !== "string" || v.length === 0) throw new SpecError(`${what} must be a string`);
  return v;
}

/** A relative path inside its mount: no leading slash, no `.` or `..` segment. */
export function checkPath(p: unknown, what: string): string {
  const s = str(p, what);
  if (!PATH.test(s) || s.split("/").some((seg) => seg === "." || seg === "..")) {
    throw new SpecError(`${what} must be a relative path without . or ..`);
  }
  return s;
}

function url(v: unknown, what: string): string {
  const s = str(v, what);
  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    throw new SpecError(`${what} is not a URL`);
  }
  if (!URL_SCHEMES.includes(parsed.protocol)) throw new SpecError(`${what} must be https or ipfs`);
  return s;
}

function int(v: unknown, [min, max]: readonly [number, number], what: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new SpecError(`${what} must be an integer from ${min} to ${max}`);
  }
  return v;
}

function input(v: unknown, i: number): Input {
  const what = `inputs[${i}]`;
  if (!isRecord(v)) throw new SpecError(`${what} must be an object`);
  if (v.kind === "git") {
    onlyKeys(v, ["kind", "path", "url", "commit"], what);
    const commit = str(v.commit, `${what}.commit`);
    if (!COMMIT.test(commit)) throw new SpecError(`${what}.commit must be a full commit id`);
    return {
      kind: "git",
      path: checkPath(v.path, `${what}.path`),
      url: url(v.url, `${what}.url`),
      commit,
    };
  }
  if (v.kind === "file") {
    onlyKeys(v, ["kind", "path", "url", "sha256"], what);
    const sha256 = str(v.sha256, `${what}.sha256`);
    if (!SHA256.test(sha256)) throw new SpecError(`${what}.sha256 must be 64 lowercase hex`);
    return {
      kind: "file",
      path: checkPath(v.path, `${what}.path`),
      url: url(v.url, `${what}.url`),
      sha256,
    };
  }
  throw new SpecError(`${what}.kind must be git or file`);
}

/** Validates an untrusted spec and returns it typed. Unknown fields are refused. */
export function parseSpec(raw: unknown): ReexecSpec {
  if (!isRecord(raw)) throw new SpecError("spec must be an object");
  onlyKeys(raw, [...SPEC_KEYS], "spec");
  if (raw.version !== SPEC_VERSION) throw new SpecError(`version must be ${SPEC_VERSION}`);

  const image = str(raw.container_digest, "container_digest");
  if (!IMAGE.test(image)) throw new SpecError("container_digest must be name@sha256:<64 hex>");
  const verifier = str(raw.verifier_digest, "verifier_digest");
  if (!DIGEST.test(verifier) && !IMAGE.test(verifier)) {
    throw new SpecError("verifier_digest must be sha256:<64 hex> or name@sha256:<64 hex>");
  }

  if (!Array.isArray(raw.inputs)) throw new SpecError("inputs must be an array");
  const inputs = raw.inputs.map(input);
  const paths = inputs.map((x) => x.path);
  for (const [i, p] of paths.entries()) {
    if (paths.some((q, j) => j !== i && (q === p || q.startsWith(`${p}/`)))) {
      throw new SpecError(`input paths overlap: ${p}`);
    }
  }

  if (!Array.isArray(raw.command) || raw.command.length === 0) {
    throw new SpecError("command must be a non-empty array");
  }
  const command = raw.command.map((c, i) => {
    if (typeof c !== "string") throw new SpecError(`command[${i}] must be a string`);
    return c;
  });
  if (command[0] === "") throw new SpecError("command[0] must name the entrypoint");

  const workdir = raw.workdir === "." ? "." : checkPath(raw.workdir, "workdir");

  if (!isRecord(raw.env)) throw new SpecError("env must be an object");
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw.env)) {
    if (!ENV_KEY.test(k)) throw new SpecError(`env key ${k} must match ${ENV_KEY.source}`);
    if (k === "HOME") throw new SpecError("env must not set HOME (runners set HOME=/tmp)");
    if (typeof v !== "string") throw new SpecError(`env.${k} must be a string`);
    env[k] = v;
  }

  if (!Array.isArray(raw.outputs) || raw.outputs.length === 0) {
    throw new SpecError("outputs must be a non-empty array");
  }
  const outputs = raw.outputs.map((o, i) => checkPath(o, `outputs[${i}]`));
  if (new Set(outputs).size !== outputs.length) throw new SpecError("outputs must be distinct");

  if (!isRecord(raw.limits)) throw new SpecError("limits must be an object");
  onlyKeys(raw.limits, ["seconds", "memory_mb", "cpus"], "limits");
  const limits: Limits = {
    seconds: int(raw.limits.seconds, LIMIT_BOUNDS.seconds, "limits.seconds"),
    memory_mb: int(raw.limits.memory_mb, LIMIT_BOUNDS.memory_mb, "limits.memory_mb"),
    cpus: int(raw.limits.cpus, LIMIT_BOUNDS.cpus, "limits.cpus"),
  };

  const spec: ReexecSpec = {
    version: SPEC_VERSION,
    container_digest: image,
    inputs,
    command,
    workdir,
    env,
    outputs,
    limits,
    verifier_digest: verifier,
  };
  if (raw.expected_exit_code !== undefined) {
    spec.expected_exit_code = int(raw.expected_exit_code, [0, 255], "expected_exit_code");
  }
  if (raw.expected_output_hash !== undefined) {
    const h = str(raw.expected_output_hash, "expected_output_hash");
    if (!HASH.test(h)) throw new SpecError("expected_output_hash must be 0x + 64 lowercase hex");
    spec.expected_output_hash = h as Hex;
  }
  return spec;
}

/** The on-chain `specHash`: keccak256 of the canonical JSON of the validated spec. */
export function specHash(spec: ReexecSpec): Hex {
  return canonicalHash(spec);
}
