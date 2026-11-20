// Runs a spec's command in its pinned container, isolated: no network, read-only root file
// system, no capabilities, no privilege escalation, an unprivileged user, fixed memory, CPU and
// process limits, and exactly the spec's environment (plus HOME=/tmp). The image is pulled by
// digest before the run (the only network access) and the run itself never pulls.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { ReexecSpec } from "./spec.ts";

export interface RunStatus {
  exitCode: number | null;
  timedOut: boolean;
}

export interface ContainerRunner {
  /** Runs `spec.command` with `workDir` at /work and `outDir` at /out. */
  run(spec: ReexecSpec, workDir: string, outDir: string): Promise<RunStatus>;
}

/** The user the job runs as (nobody). */
export const JOB_USER = "65534:65534";

/** Every argument of `docker run` for this spec, in order. */
export function dockerRunArgs(
  spec: ReexecSpec,
  workDir: string,
  outDir: string,
  name: string,
): string[] {
  const [entrypoint, ...args] = spec.command;
  if (entrypoint === undefined) throw new Error("empty command");
  const workdir = spec.workdir === "." ? "/work" : `/work/${spec.workdir}`;
  const env = Object.entries({ ...spec.env, HOME: "/tmp" }).sort(([a], [b]) => (a < b ? -1 : 1));
  return [
    "run",
    "--rm",
    "--name",
    name,
    "--pull",
    "never",
    "--network",
    "none",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,exec,size=1g",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--user",
    JOB_USER,
    "--memory",
    `${spec.limits.memory_mb}m`,
    "--memory-swap",
    `${spec.limits.memory_mb}m`,
    "--cpus",
    String(spec.limits.cpus),
    "--pids-limit",
    "512",
    "--mount",
    `type=bind,source=${workDir},target=/work`,
    "--mount",
    `type=bind,source=${outDir},target=/out`,
    "--workdir",
    workdir,
    ...env.flatMap(([k, v]) => ["--env", `${k}=${v}`]),
    "--entrypoint",
    entrypoint,
    spec.container_digest,
    ...args,
  ];
}

/** Longest an image pull may take; the image is chosen by the job's client. */
export const PULL_TIMEOUT_MS = 600_000;
/**
 * Most a job may write to /work and /out together (the bind mounts have no quota of their own;
 * security report 2026-11-20). A job that writes more is killed and the run fails, which the
 * validator turns into a reject vote, before the host's disk fills.
 */
export const MAX_JOB_DISK_BYTES = 1024 * 1024 * 1024;
/** How often the job's directories are measured while it runs. */
const DISK_POLL_MS = 1_000;

function exec(docker: string, args: readonly string[], timeoutMs?: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(docker, [...args], { shell: false, stdio: ["ignore", "ignore", "ignore"] });
    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error(`docker ${args[0] ?? ""} took longer than ${timeoutMs} ms`));
          }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

/** Bytes under `dir` (regular files, symlinks not followed), stopping once `limit` is passed. */
export async function diskUsage(dir: string, limit = Number.POSITIVE_INFINITY): Promise<number> {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0 && total <= limit) {
    const d = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      continue; // Removed while we looked: nothing to count.
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

export class DockerRunner implements ContainerRunner {
  readonly #docker: string;
  readonly #maxDiskBytes: number;

  constructor(docker = "docker", maxDiskBytes = MAX_JOB_DISK_BYTES) {
    this.#docker = docker;
    this.#maxDiskBytes = maxDiskBytes;
  }

  async run(spec: ReexecSpec, workDir: string, outDir: string): Promise<RunStatus> {
    if ((await exec(this.#docker, ["pull", "-q", spec.container_digest], PULL_TIMEOUT_MS)) !== 0) {
      throw new Error(`docker pull ${spec.container_digest} failed`);
    }
    const name = `arl-verify-${randomBytes(8).toString("hex")}`;
    // An object, not a local boolean: the timer callback sets it after `exec` has started.
    const state = { timedOut: false, tooLarge: false };
    const timer = setTimeout(() => {
      state.timedOut = true;
      void exec(this.#docker, ["kill", name]).catch(() => undefined);
    }, spec.limits.seconds * 1000);
    let measuring = false;
    const disk = setInterval(() => {
      if (measuring || state.tooLarge) return;
      measuring = true;
      void (async () => {
        const used =
          (await diskUsage(outDir, this.#maxDiskBytes)) +
          (await diskUsage(workDir, this.#maxDiskBytes));
        if (used > this.#maxDiskBytes) {
          state.tooLarge = true;
          await exec(this.#docker, ["kill", name]).catch(() => undefined);
        }
      })().finally(() => {
        measuring = false;
      });
    }, DISK_POLL_MS);
    try {
      const code = await exec(this.#docker, dockerRunArgs(spec, workDir, outDir, name));
      if (state.tooLarge) {
        throw new Error(`the job wrote more than ${this.#maxDiskBytes} bytes to /work and /out`);
      }
      return { exitCode: state.timedOut ? null : code, timedOut: state.timedOut };
    } finally {
      clearTimeout(timer);
      clearInterval(disk);
    }
  }
}
