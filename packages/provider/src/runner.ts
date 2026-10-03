// Runs one operator-defined job as a child process under a hard time limit and measures it.
//
// The command and its arguments come from the provider's own job table, never from the payer:
// the payer only chooses a job by name and supplies its standard input. The process gets no shell
// and an empty environment (nothing from the provider's environment, such as keys, leaks into
// it), is killed when the paid time runs out, and its output is capped. Isolation beyond that
// (containers, GPU assignment, network and file-system limits) belongs in the job's own command,
// for example `docker run --rm --network none …`.

import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

export interface ComputeJob {
  /** Executable, resolved by the operating system (no shell). */
  command: string;
  args: readonly string[];
  /** Working directory for the job. Defaults to the provider's. */
  cwd?: string;
}

export interface RunLimits {
  /** The process is killed after this many seconds. */
  seconds: number;
  maxOutputBytes: number;
}

export interface RunOutcome {
  /** Wall-clock milliseconds from start to exit. */
  elapsedMs: number;
  exitCode: number | null;
  /** The process was killed because the paid time ran out. */
  timedOut: boolean;
  stdout: Buffer;
  stderr: Buffer;
  /** Output beyond `maxOutputBytes` was dropped. */
  truncated: boolean;
}

export type Runner = (job: ComputeJob, input: Buffer, limits: RunLimits) => Promise<RunOutcome>;

/** Raised when the job could not be started at all; no compute was used and nothing is billed. */
export class JobStartError extends Error {
  override name = "JobStartError";
}

export const runProcess: Runner = (job, input, limits) =>
  new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(job.command, [...job.args], {
      cwd: job.cwd,
      env: {},
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let timedOut = false;
    let truncated = false;
    const capture = (stream: NodeJS.ReadableStream) => {
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        const room = limits.maxOutputBytes - size;
        if (chunk.length > room) truncated = true;
        if (room > 0) chunks.push(chunk.subarray(0, room));
        size += Math.min(chunk.length, Math.max(room, 0));
      });
      return () => Buffer.concat(chunks);
    };
    const stdout = capture(child.stdout);
    const stderr = capture(child.stderr);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, limits.seconds * 1000);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new JobStartError(`job could not start: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        elapsedMs: performance.now() - started,
        exitCode: code,
        timedOut,
        stdout: stdout(),
        stderr: stderr(),
        truncated,
      });
    });
    // A job that does not read its input closes the pipe early; that is not an error.
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
