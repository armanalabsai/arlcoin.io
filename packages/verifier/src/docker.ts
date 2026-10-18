// Runs a spec's command in its pinned container, isolated: no network, read-only root file
// system, no capabilities, no privilege escalation, an unprivileged user, fixed memory, CPU and
// process limits, and exactly the spec's environment (plus HOME=/tmp). The image is pulled by
// digest before the run (the only network access) and the run itself never pulls.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

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

function exec(docker: string, args: readonly string[]): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(docker, [...args], { shell: false, stdio: ["ignore", "ignore", "ignore"] });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve(code);
    });
  });
}

export class DockerRunner implements ContainerRunner {
  readonly #docker: string;

  constructor(docker = "docker") {
    this.#docker = docker;
  }

  async run(spec: ReexecSpec, workDir: string, outDir: string): Promise<RunStatus> {
    if ((await exec(this.#docker, ["pull", "-q", spec.container_digest])) !== 0) {
      throw new Error(`docker pull ${spec.container_digest} failed`);
    }
    const name = `arl-verify-${randomBytes(8).toString("hex")}`;
    // An object, not a local boolean: the timer callback sets it after `exec` has started.
    const state = { timedOut: false };
    const timer = setTimeout(() => {
      state.timedOut = true;
      void exec(this.#docker, ["kill", name]);
    }, spec.limits.seconds * 1000);
    try {
      const code = await exec(this.#docker, dockerRunArgs(spec, workDir, outDir, name));
      return { exitCode: state.timedOut ? null : code, timedOut: state.timedOut };
    } finally {
      clearTimeout(timer);
    }
  }
}
