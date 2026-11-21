// Builds the spec of the most common job a provider is hired for: run a repository's tests at an
// exact commit and prove the outcome. The spec pins everything a validator needs to get the same
// result: the image by digest, the commit by id, the command, and what counts as the result.

import { parseSpec, type ReexecSpec } from "./spec.ts";

/** The official Node.js 22 image, pinned by digest (the image of the first verified job). */
export const NODE_IMAGE =
  "docker.io/library/node@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a";

/** Build of this verifier that checks the job (docs/reexecution-spec.md). */
export const VERIFIER_DIGEST =
  "sha256:02119efebb69c51cd27855462ab8618d4d6f8cc0ebbc2e6943b41f9ca99efc02";

/**
 * Runs Node's own test runner and keeps only the counts: the TAP report carries timings, which
 * differ on every machine, so the result is the summary lines and the exit status. `/tmp` is the
 * only writable place besides `/out`.
 */
export const NODE_TEST_COMMAND = [
  "sh",
  "-c",
  "node --test --test-reporter=tap > /tmp/tap.txt 2>&1; code=$?; " +
    "grep -E '^# (tests|suites|pass|fail|cancelled|skipped|todo) ' /tmp/tap.txt > /out/summary.txt; " +
    "exit $code",
] as const;

export interface TestRunInput {
  /** The repository, cloned over https. */
  repository: string;
  /** The full commit id whose tree is tested. */
  commit: string;
  /** Directory inside the repository to run in (default: its root). */
  directory?: string;
  /** Longest the run may take, in seconds (default 300). */
  seconds?: number;
  /** Memory for the run, in MiB (default 512). */
  memoryMb?: number;
}

/**
 * The spec of a test run with Node's built-in runner. The job is accepted only when every test
 * passes (exit code 0); the result is the runner's summary counts. The container has no network,
 * so the tests must run from the checkout alone, without an install step.
 */
export function nodeTestSpec(input: TestRunInput): ReexecSpec {
  const directory = (input.directory ?? "").replace(/^\/+|\/+$/g, "");
  return parseSpec({
    version: "arl-reexec/1",
    container_digest: NODE_IMAGE,
    inputs: [{ kind: "git", path: "repo", url: input.repository, commit: input.commit }],
    command: [...NODE_TEST_COMMAND],
    workdir: directory === "" ? "repo" : `repo/${directory}`,
    env: { TZ: "UTC" },
    outputs: ["summary.txt"],
    limits: { seconds: input.seconds ?? 300, memory_mb: input.memoryMb ?? 512, cpus: 1 },
    expected_exit_code: 0,
    verifier_digest: VERIFIER_DIGEST,
  });
}
