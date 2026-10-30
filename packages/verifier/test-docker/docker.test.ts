// Runs specs in a real container (busybox, pinned by digest) through DockerRunner: the job is
// isolated (no network, read-only root, unprivileged user), the result is deterministic across
// runs, and the time limit is enforced. Needs a running Docker daemon and network access to pull
// the image. Run: npm run test:docker -w @arl/verifier
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

import {
  decide,
  DockerRunner,
  execute,
  parseSpec,
  sha256,
  specHash,
  type Fetcher,
} from "../src/index.ts";

// busybox 1.37.0 (docker.io/library/busybox), multi-arch index digest.
const BUSYBOX =
  "docker.io/library/busybox@sha256:bdf57e528e45e4433820e045b29b4597825a1c9e38353532d90a01445013f82e";
const INPUT = Buffer.from("line one\nline two\n");
const files: Fetcher = { file: () => Promise.resolve(INPUT), git: () => Promise.resolve() };
const opts = { runner: new DockerRunner(), fetcher: files };

function dockerAvailable(): boolean {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const job = (script: string, outputs: string[], seconds = 60) =>
  parseSpec({
    version: "arl-reexec/1",
    container_digest: BUSYBOX,
    inputs: [
      {
        kind: "file",
        path: "data/in.txt",
        url: "https://example.com/in.txt",
        sha256: sha256(INPUT),
      },
    ],
    command: ["sh", "-c", script],
    workdir: ".",
    env: { LC_ALL: "C" },
    outputs,
    limits: { seconds, memory_mb: 128, cpus: 1 },
    verifier_digest: `sha256:${"0".repeat(64)}`,
  });

describe("DockerRunner", { skip: !dockerAvailable() && "no Docker daemon" }, () => {
  it("runs deterministically and the result checks out", async () => {
    const s = job("wc -l < /work/data/in.txt > /out/lines.txt && id -u > /out/uid.txt", [
      "lines.txt",
      "uid.txt",
    ]);
    const first = await execute(s, opts);
    const second = await execute(s, opts);
    assert.equal(first.result.exit_code, 0);
    assert.equal(first.hash, second.hash);
    assert.equal(first.result.outputs[0]?.sha256, sha256(Buffer.from("2\n")));
    // The job runs as nobody.
    assert.equal(first.result.outputs[1]?.sha256, sha256(Buffer.from("65534\n")));
    const d = await decide(s, specHash(s), first.hash, opts);
    assert.equal(d.approve, true);
  });

  it("has no network and a read-only root file system", async () => {
    const s = job(
      "(wget -q -T 3 -O /dev/null http://1.1.1.1 && echo yes > /out/net.txt); (touch /etc/x && echo yes > /out/root.txt); echo done > /out/done.txt",
      ["net.txt", "root.txt", "done.txt"],
    );
    const { result } = await execute(s, opts);
    assert.deepEqual(
      result.outputs.map((o) => o.sha256 !== null),
      [true, false, false], // sorted: done.txt, net.txt, root.txt
    );
  });

  it("gets only the spec's environment and HOME=/tmp", async () => {
    const s = job("env | grep -v '^HOSTNAME=' | sort > /out/env.txt", ["env.txt"]);
    const { result } = await execute(s, opts);
    // Docker adds PATH from the image; nothing from the validator's own environment leaks in.
    const env =
      "HOME=/tmp\nLC_ALL=C\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nPWD=/work\nSHLVL=1\n";
    assert.equal(result.outputs[0]?.sha256, sha256(Buffer.from(env)));
  });

  it("kills the job at its time limit", async () => {
    const s = job("sleep 30; echo late > /out/late.txt", ["late.txt"], 2);
    const { result } = await execute(s, opts);
    assert.equal(result.timed_out, true);
    assert.equal(result.exit_code, null);
    assert.equal(result.outputs[0]?.sha256, null);
  });

  it("reports a failing job faithfully", async () => {
    const s = job("echo 'FAIL 1 of 3' > /out/summary.txt; exit 1", ["summary.txt"]);
    const { result, hash } = await execute(s, opts);
    assert.equal(result.exit_code, 1);
    assert.equal((await decide(s, specHash(s), hash, opts)).approve, true);
    const strict = parseSpec({ ...s, expected_exit_code: 0 });
    const r2 = await execute(strict, opts);
    assert.equal((await decide(strict, specHash(strict), r2.hash, opts)).approve, false);
  });
});
