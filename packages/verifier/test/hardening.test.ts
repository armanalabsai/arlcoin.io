// Security reports 2026-11-20: validator resource safety (disk, memory, deadlines) and a watch
// state that survives crashes.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  diskUsage,
  readLimited,
  execute,
  parseSpec,
  parseWatchState,
  saveWatchState,
  serializeWatchState,
  type ContainerRunner,
  type Fetcher,
  type WatchState,
} from "../src/index.ts";

const SPEC = parseSpec({
  version: "arl-reexec/1",
  container_digest: `docker.io/library/node@sha256:${"a".repeat(64)}`,
  inputs: [],
  command: ["node", "job.mjs"],
  workdir: ".",
  env: {},
  outputs: ["big.bin"],
  limits: { seconds: 60, memory_mb: 256, cpus: 1 },
  verifier_digest: `sha256:${"c".repeat(64)}`,
});

const noFetch: Fetcher = {
  file: () => Promise.reject(new Error("no network in tests")),
  git: () => Promise.reject(new Error("no network in tests")),
};

describe("watch state on disk", () => {
  const state: WatchState = { fromBlock: 150n, jobs: ["7"], specs: { "7": SPEC } };

  it("round-trips through an atomic save", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arl-state-"));
    try {
      const path = join(dir, "state.json");
      await saveWatchState(path, state);
      await saveWatchState(path, { ...state, fromBlock: 151n });
      const loaded = parseWatchState(await readFile(path, "utf8"));
      assert.equal(loaded.fromBlock, 151n);
      assert.deepEqual(loaded.jobs, ["7"]);
      assert.deepEqual(loaded.specs?.["7"], SPEC);
      // No temporary file is left behind.
      assert.deepEqual(await readdir(dir), ["state.json"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses a torn file instead of treating it as a first start", () => {
    const text = serializeWatchState(state);
    assert.throws(() => parseWatchState(text.slice(0, 40)));
  });

  it("refuses valid JSON of the wrong shape", () => {
    assert.throws(() => parseWatchState("[]"), /object/);
    assert.throws(() => parseWatchState('{"fromBlock":"abc","jobs":[]}'), /block/);
    assert.throws(() => parseWatchState('{"fromBlock":"1","jobs":[7]}'), /job ids/);
    assert.throws(() => parseWatchState('{"fromBlock":"1","jobs":[],"specs":{"x":{}}}'), /job id/);
    assert.throws(() => parseWatchState('{"fromBlock":"1","jobs":[],"specs":{"1":{}}}'));
  });

  it("accepts a state saved before specs were kept", () => {
    assert.deepEqual(parseWatchState('{"fromBlock":"5","jobs":["1"]}'), {
      fromBlock: 5n,
      jobs: ["1"],
      specs: {},
    });
  });
});

describe("job disk use", () => {
  it("counts every file below a directory and stops early past the limit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arl-du-"));
    try {
      await mkdir(join(dir, "a", "b"), { recursive: true });
      await writeFile(join(dir, "x"), Buffer.alloc(1000));
      await writeFile(join(dir, "a", "b", "y"), Buffer.alloc(500));
      assert.equal(await diskUsage(dir), 1500);
      assert.ok((await diskUsage(dir, 10)) > 10);
      assert.equal(await diskUsage(join(dir, "missing")), 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("output hashing", () => {
  it("streams a large output through the hash with the same result as hashing it whole", async () => {
    const bytes = Buffer.alloc(8 * 1024 * 1024 + 123, 7);
    const runner: ContainerRunner = {
      async run(_spec, _work, out) {
        await writeFile(join(out, "big.bin"), bytes);
        return { exitCode: 0, timedOut: false };
      },
    };
    const { result } = await execute(SPEC, { runner, fetcher: noFetch });
    assert.deepEqual(result.outputs, [
      { path: "big.bin", sha256: createHash("sha256").update(bytes).digest("hex") },
    ]);
  });
});

describe("input downloads", () => {
  const stream = (sizes: number[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const n of sizes) c.enqueue(new Uint8Array(n));
        c.close();
      },
    });

  it("reads a body within the limit", async () => {
    assert.equal((await readLimited(stream([10, 20]), 30)).length, 30);
    assert.equal((await readLimited(null, 30)).length, 0);
  });

  it("stops a body that passes the limit while it streams", async () => {
    await assert.rejects(() => readLimited(stream([20, 20]), 30), /larger than 30 bytes/);
  });
});
