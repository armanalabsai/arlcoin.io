// Materializes a spec's inputs into a fresh work directory, checking every byte against the
// spec: a file must match its SHA-256, a git checkout must be exactly the named commit. The
// `.git` directory is removed afterwards, so the workspace is a function of the commit's tree.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import type { FileInput, GitInput, ReexecSpec } from "./spec.ts";

/** Largest input file accepted, in bytes. */
export const MAX_FILE_BYTES = 256 * 1024 * 1024;

export class InputError extends Error {
  override name = "InputError";
}

export interface Fetcher {
  /** The bytes at `url` (https, or ipfs through a gateway). */
  file(url: string): Promise<Buffer>;
  /** A checkout of `commit` from `url` into the empty directory `dir`. */
  git(url: string, commit: string, dir: string): Promise<void>;
}

/** `path` joined under `root`, refusing anything that resolves outside it. */
export function inside(root: string, path: string): string {
  const base = resolve(root);
  const full = resolve(base, path);
  if (full !== base && !full.startsWith(base + sep)) {
    throw new InputError(`${path} leaves its directory`);
  }
  return full;
}

function run(cmd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, [...args], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", GIT_TERMINAL_PROMPT: "0" },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => err.push(c));
    child.on("error", (e) => {
      reject(new InputError(`${cmd} could not start: ${e.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) resolvePromise(Buffer.concat(out).toString("utf8"));
      else
        reject(
          new InputError(
            `${cmd} ${args[0] ?? ""} failed: ${Buffer.concat(err).toString("utf8").trim()}`,
          ),
        );
    });
  });
}

export function ipfsGateway(): string {
  return process.env.ARL_IPFS_GATEWAY ?? "https://ipfs.io/ipfs/";
}

/** Resolves https URLs as is and `ipfs://<cid>/<path>` through the configured gateway. */
export function httpUrl(url: string): string {
  if (url.startsWith("ipfs://")) return ipfsGateway() + url.slice("ipfs://".length);
  if (url.startsWith("https://")) return url;
  throw new InputError(`unsupported URL ${url}`);
}

export const networkFetcher: Fetcher = {
  async file(url) {
    const res = await fetch(httpUrl(url), { redirect: "follow" });
    if (!res.ok) throw new InputError(`GET ${url}: HTTP ${res.status}`);
    const length = Number(res.headers.get("content-length") ?? "0");
    if (length > MAX_FILE_BYTES)
      throw new InputError(`${url} is larger than ${MAX_FILE_BYTES} bytes`);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_FILE_BYTES)
      throw new InputError(`${url} is larger than ${MAX_FILE_BYTES} bytes`);
    return body;
  },
  async git(url, commit, dir) {
    await run("git", ["-C", dir, "init", "-q"]);
    await run("git", ["-C", dir, "fetch", "-q", "--depth", "1", url, commit]);
    await run("git", [
      "-C",
      dir,
      "-c",
      "advice.detachedHead=false",
      "checkout",
      "-q",
      "FETCH_HEAD",
    ]);
  },
};

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function materializeFile(input: FileInput, target: string, fetcher: Fetcher): Promise<void> {
  const data = await fetcher.file(input.url);
  const got = sha256(data);
  if (got !== input.sha256) throw new InputError(`${input.path}: sha256 ${got} != ${input.sha256}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data, { mode: 0o644 });
}

async function materializeGit(input: GitInput, target: string, fetcher: Fetcher): Promise<void> {
  await mkdir(target, { recursive: true });
  await fetcher.git(input.url, input.commit, target);
  const head = (await run("git", ["-C", target, "rev-parse", "HEAD"])).trim();
  if (head !== input.commit) throw new InputError(`${input.path}: HEAD ${head} != ${input.commit}`);
  await rm(join(target, ".git"), { recursive: true, force: true });
}

/** Writes every input of `spec` under `workDir` (which must be empty). */
export async function materialize(
  spec: ReexecSpec,
  workDir: string,
  fetcher: Fetcher,
): Promise<void> {
  for (const input of spec.inputs) {
    const target = inside(workDir, input.path);
    if (input.kind === "file") await materializeFile(input, target, fetcher);
    else await materializeGit(input, target, fetcher);
  }
}
