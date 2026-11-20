// Materializes a spec's inputs into a fresh work directory, checking every byte against the
// spec: a file must match its SHA-256, a git checkout must be exactly the named commit. The
// `.git` directory is removed afterwards, so the workspace is a function of the commit's tree.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
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

/**
 * True when every existing directory between `root` and `full` is a real directory, not a
 * symlink. `inside` compares path strings and O_NOFOLLOW only guards the last component, so a
 * symlinked directory on the way (for example one a job created in its output directory, or one
 * checked out from a git input) would otherwise lead outside `root` (security report 2026-11-15).
 */
export async function noSymlinkOnPath(root: string, full: string): Promise<boolean> {
  const base = resolve(root);
  const parts = full.slice(base.length).split(sep).filter(Boolean);
  let current = base;
  for (const part of parts.slice(0, -1)) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) return false;
    } catch {
      return true; // Not there yet: nothing below it can be followed.
    }
  }
  return true;
}

/** Longest a single input download may take (security report 2026-11-20: no deadline). */
export const FETCH_TIMEOUT_MS = 120_000;
/** Longest a single git step (init, fetch, checkout) may take. */
export const GIT_TIMEOUT_MS = 300_000;

/** Most a git input may take on disk, history and checkout together. */
export const MAX_GIT_BYTES = 1024 * 1024 * 1024;

/**
 * Bytes under `dir` (no symlinks followed), stopping once past `limit`. Kept here, not in
 * docker.ts, so the input path does not depend on the runner.
 */
async function sizeOf(dir: string, limit: number): Promise<number> {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0 && total <= limit) {
    const d = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else {
        try {
          total += (await lstat(p)).size;
        } catch {
          // Removed while we looked.
        }
      }
    }
  }
  return total;
}

/** A command, killed at `timeoutMs` or when `watch.dir` grows past `watch.maxBytes`. */
function run(
  cmd: string,
  args: readonly string[],
  timeoutMs = GIT_TIMEOUT_MS,
  watch?: { dir: string; maxBytes: number },
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, [...args], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", GIT_TERMINAL_PROMPT: "0" },
    });
    // The remote is chosen by the job's client: a stalled transfer must not hold the validator.
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    // The repository is chosen by the job's client: its size is bounded while it downloads, not
    // after (security report 2026-11-20).
    let tooLarge = false;
    let measuring = false;
    const poll =
      watch === undefined
        ? undefined
        : setInterval(() => {
            if (measuring || tooLarge) return;
            measuring = true;
            void sizeOf(watch.dir, watch.maxBytes)
              .then((n) => {
                if (n > watch.maxBytes) {
                  tooLarge = true;
                  child.kill("SIGKILL");
                }
              })
              .finally(() => {
                measuring = false;
              });
          }, 500);
    child.on("exit", () => {
      clearTimeout(timer);
      clearInterval(poll);
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => err.push(c));
    child.on("error", (e) => {
      reject(new InputError(`${cmd} could not start: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      clearInterval(poll);
      if (tooLarge)
        reject(new InputError(`${cmd} ${args[0] ?? ""} grew past ${watch?.maxBytes ?? 0} bytes`));
      else if (timedOut)
        reject(new InputError(`${cmd} ${args[0] ?? ""} took longer than ${timeoutMs} ms`));
      else if (code === 0) resolvePromise(Buffer.concat(out).toString("utf8"));
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

/** Reads a response body, failing as soon as it passes `max` bytes. */
export async function readLimited(
  body: ReadableStream<Uint8Array> | null,
  max: number,
  url = "the input",
): Promise<Buffer> {
  if (body === null) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new InputError(`${url} is larger than ${max} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

export const networkFetcher: Fetcher = {
  async file(url) {
    // The URL is chosen by the job's client, so the whole download (headers and body) has a
    // deadline (security report 2026-11-20).
    const res = await fetch(httpUrl(url), {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new InputError(`GET ${url}: HTTP ${res.status}`);
    const length = Number(res.headers.get("content-length") ?? "0");
    if (length > MAX_FILE_BYTES)
      throw new InputError(`${url} is larger than ${MAX_FILE_BYTES} bytes`);
    // Counted while it streams: a server that sends no length, or a false one, is cut off at the
    // limit instead of being buffered whole first (security report 2026-11-20).
    return readLimited(res.body, MAX_FILE_BYTES, url);
  },
  async git(url, commit, dir) {
    await run("git", ["-C", dir, "init", "-q"]);
    const watch = { dir, maxBytes: MAX_GIT_BYTES };
    await run(
      "git",
      ["-C", dir, "fetch", "-q", "--depth", "1", url, commit],
      GIT_TIMEOUT_MS,
      watch,
    );
    await run(
      "git",
      ["-C", dir, "-c", "advice.detachedHead=false", "checkout", "-q", "FETCH_HEAD"],
      GIT_TIMEOUT_MS,
      watch,
    );
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
    if (!(await noSymlinkOnPath(workDir, target))) {
      throw new InputError(`${input.path} goes through a symlinked directory`);
    }
    if (input.kind === "file") await materializeFile(input, target, fetcher);
    else await materializeGit(input, target, fetcher);
  }
}
