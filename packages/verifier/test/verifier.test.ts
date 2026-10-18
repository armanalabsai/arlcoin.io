import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { keccak256, stringToBytes, type Hex } from "viem";

import {
  acceptance,
  CanonicalError,
  canonicalHash,
  canonicalize,
  ChainError,
  checkChain,
  decide,
  dockerRunArgs,
  execute,
  httpUrl,
  inside,
  InputError,
  materialize,
  networkFetcher,
  parseSpec,
  RESULT_VERSION,
  resultHash,
  sha256,
  SpecError,
  specHash,
  type ContainerRunner,
  type Fetcher,
  type ReexecSpec,
} from "../src/index.ts";

const IMAGE = `docker.io/library/node@sha256:${"a".repeat(64)}`;
const FILE_BYTES = Buffer.from("hello arl\n");
const FILE_SHA = sha256(FILE_BYTES);

function rawSpec(): Record<string, unknown> {
  return {
    version: "arl-reexec/1",
    container_digest: IMAGE,
    inputs: [
      {
        kind: "git",
        path: "repo",
        url: "https://github.com/example/repo.git",
        commit: "b".repeat(40),
      },
      { kind: "file", path: "data/in.txt", url: "https://example.com/in.txt", sha256: FILE_SHA },
    ],
    command: ["npm", "test", "--", "--reporter=json"],
    workdir: "repo",
    env: { CI: "1", TZ: "UTC" },
    outputs: ["result.json", "coverage/lcov.info"],
    limits: { seconds: 600, memory_mb: 2048, cpus: 2 },
    verifier_digest: `sha256:${"c".repeat(64)}`,
  };
}

const spec = (patch: Record<string, unknown> = {}): ReexecSpec =>
  parseSpec({ ...rawSpec(), ...patch });

describe("canonical JSON", () => {
  it("sorts keys, drops whitespace and keeps array order", () => {
    assert.equal(
      canonicalize({ b: 1, a: [true, null, "x"], c: { z: 0, y: "é" } }),
      '{"a":[true,null,"x"],"b":1,"c":{"y":"é","z":0}}',
    );
  });

  it("sorts keys by UTF-16 code units, as RFC 8785 does", () => {
    assert.equal(canonicalize({ é: 1, z: 2, A: 3, "\u{1F600}": 4 }), '{"A":3,"z":2,"é":1,"😀":4}');
  });

  it("escapes strings as JSON.stringify", () => {
    assert.equal(canonicalize('a"b\\c\n\u0001'), '"a\\"b\\\\c\\n\\u0001"');
  });

  it("drops undefined object fields", () => {
    assert.equal(canonicalize({ a: undefined, b: 1 }), '{"b":1}');
  });

  it("refuses floats, unsafe integers and non-plain values", () => {
    assert.throws(() => canonicalize(1.5), CanonicalError);
    assert.throws(() => canonicalize(Number.NaN), CanonicalError);
    assert.throws(() => canonicalize(2 ** 53), CanonicalError);
    assert.throws(() => canonicalize(new Date(0)), CanonicalError);
    assert.throws(() => canonicalize([undefined]), CanonicalError);
    assert.throws(() => canonicalize(1n), CanonicalError);
  });

  it("hashes the UTF-8 bytes of the canonical form", () => {
    assert.equal(canonicalHash({ b: 1, a: 2 }), keccak256(stringToBytes('{"a":2,"b":1}')));
  });
});

describe("spec", () => {
  it("parses a valid spec", () => {
    const s = spec();
    assert.equal(s.inputs.length, 2);
    assert.deepEqual(s.command, ["npm", "test", "--", "--reporter=json"]);
  });

  it("has a hash independent of field order", () => {
    const reversed = Object.fromEntries(Object.entries(rawSpec()).reverse());
    assert.equal(specHash(parseSpec(reversed)), specHash(spec()));
  });

  it("has a stable hash (test vector)", () => {
    assert.equal(specHash(spec()), SPEC_VECTOR);
  });

  it("accepts optional acceptance conditions and the root workdir", () => {
    const s = spec({
      expected_exit_code: 0,
      expected_output_hash: `0x${"d".repeat(64)}`,
      workdir: ".",
    });
    assert.equal(s.expected_exit_code, 0);
    assert.equal(s.workdir, ".");
  });

  const refused: [string, Record<string, unknown>][] = [
    ["unknown field", { extra: 1 }],
    ["version", { version: "arl-reexec/2" }],
    ["image without digest", { container_digest: "node:22" }],
    ["image with short digest", { container_digest: "node@sha256:abc" }],
    ["verifier digest", { verifier_digest: "latest" }],
    ["inputs not an array", { inputs: {} }],
    ["input kind", { inputs: [{ kind: "s3", path: "a", url: "https://x.y/a" }] }],
    ["input not an object", { inputs: ["a"] }],
    [
      "git unknown field",
      {
        inputs: [
          { kind: "git", path: "a", url: "https://x.y/a", commit: "b".repeat(40), ref: "main" },
        ],
      },
    ],
    [
      "short commit",
      { inputs: [{ kind: "git", path: "a", url: "https://x.y/a", commit: "abc123" }] },
    ],
    [
      "bad sha256",
      { inputs: [{ kind: "file", path: "a", url: "https://x.y/a", sha256: "A".repeat(64) }] },
    ],
    ["http url", { inputs: [{ kind: "file", path: "a", url: "http://x.y/a", sha256: FILE_SHA }] }],
    ["not a url", { inputs: [{ kind: "file", path: "a", url: "x", sha256: FILE_SHA }] }],
    [
      "path traversal",
      { inputs: [{ kind: "file", path: "../a", url: "https://x.y/a", sha256: FILE_SHA }] },
    ],
    [
      "absolute path",
      { inputs: [{ kind: "file", path: "/etc/a", url: "https://x.y/a", sha256: FILE_SHA }] },
    ],
    [
      "dot segment",
      { inputs: [{ kind: "file", path: "a/./b", url: "https://x.y/a", sha256: FILE_SHA }] },
    ],
    [
      "overlapping inputs",
      {
        inputs: [
          { kind: "file", path: "a", url: "https://x.y/a", sha256: FILE_SHA },
          { kind: "file", path: "a/b", url: "https://x.y/b", sha256: FILE_SHA },
        ],
      },
    ],
    ["empty command", { command: [] }],
    ["empty entrypoint", { command: [""] }],
    ["non-string argument", { command: ["node", 1] }],
    ["workdir traversal", { workdir: "../x" }],
    ["env not an object", { env: [] }],
    ["lowercase env key", { env: { path: "/bin" } }],
    ["HOME in env", { env: { HOME: "/root" } }],
    ["non-string env value", { env: { CI: 1 } }],
    ["no outputs", { outputs: [] }],
    ["duplicate outputs", { outputs: ["a", "a"] }],
    ["limits not an object", { limits: 1 }],
    ["unknown limit", { limits: { seconds: 1, memory_mb: 64, cpus: 1, gpus: 1 } }],
    ["fractional limit", { limits: { seconds: 1.5, memory_mb: 64, cpus: 1 } }],
    ["limit out of range", { limits: { seconds: 3601, memory_mb: 64, cpus: 1 } }],
    ["exit code out of range", { expected_exit_code: 256 }],
    ["output hash format", { expected_output_hash: "0xABC" }],
  ];
  for (const [what, patch] of refused) {
    it(`refuses: ${what}`, () => {
      assert.throws(() => spec(patch), SpecError);
    });
  }

  it("refuses a non-object spec", () => {
    assert.throws(() => parseSpec([]), SpecError);
    assert.throws(() => parseSpec(null), SpecError);
  });
});

describe("result", () => {
  const result = {
    version: RESULT_VERSION,
    spec_hash: specHash(spec()),
    exit_code: 0,
    timed_out: false,
    outputs: [{ path: "result.json", sha256: FILE_SHA }],
  } as const;

  it("is accepted without conditions", () => {
    assert.deepEqual(acceptance(spec(), { ...result, outputs: [...result.outputs] }), {
      ok: true,
      reason: "accepted",
    });
  });

  it("refuses a timeout, a wrong exit code and a different expected hash", () => {
    const r = { ...result, outputs: [...result.outputs] };
    assert.equal(acceptance(spec(), { ...r, timed_out: true, exit_code: null }).ok, false);
    assert.equal(acceptance(spec({ expected_exit_code: 1 }), r).ok, false);
    assert.equal(acceptance(spec({ expected_output_hash: `0x${"0".repeat(64)}` }), r).ok, false);
    assert.equal(acceptance(spec({ expected_output_hash: resultHash(r) }), r).ok, true);
  });
});

describe("docker arguments", () => {
  it("isolate the job and pass exactly the spec's environment", () => {
    const args = dockerRunArgs(spec(), "/tmp/w", "/tmp/o", "arl-verify-x");
    const has = (...xs: string[]) => {
      const i = args.indexOf(xs[0] ?? "");
      assert.ok(i >= 0, `missing ${xs[0] ?? ""}`);
      assert.deepEqual(args.slice(i, i + xs.length), xs);
    };
    has("--network", "none");
    has("--pull", "never");
    has("--read-only");
    has("--cap-drop", "ALL");
    has("--security-opt", "no-new-privileges");
    has("--user", "65534:65534");
    has("--memory", "2048m", "--memory-swap", "2048m", "--cpus", "2", "--pids-limit", "512");
    has("--workdir", "/work/repo");
    has("--env", "CI=1", "--env", "HOME=/tmp", "--env", "TZ=UTC");
    assert.deepEqual(args.slice(-6), [
      "--entrypoint",
      "npm",
      IMAGE,
      "test",
      "--",
      "--reporter=json",
    ]);
    assert.equal(args.filter((a) => a === "--env").length, 3);
  });

  it("use /work as the root workdir", () => {
    const args = dockerRunArgs(spec({ workdir: "." }), "/w", "/o", "n");
    assert.equal(args[args.indexOf("--workdir") + 1], "/work");
  });
});

describe("inputs", () => {
  it("keep paths inside their directory", () => {
    assert.equal(inside("/a", "b/c"), "/a/b/c");
    assert.throws(() => inside("/a", "../b"), InputError);
    assert.throws(() => inside("/a", "/etc"), InputError);
  });

  it("resolve ipfs through the gateway", () => {
    assert.equal(httpUrl("ipfs://cid/x"), "https://ipfs.io/ipfs/cid/x");
    assert.equal(httpUrl("https://a/b"), "https://a/b");
    assert.throws(() => httpUrl("ftp://a"), InputError);
  });

  it("check a git checkout against its commit and drop .git", async () => {
    const repo = await mkdtemp(join(tmpdir(), "arl-git-"));
    const git = (...a: string[]) =>
      execFileSync("git", ["-C", repo, ...a], { encoding: "utf8" }).trim();
    git("init", "-q");
    await writeFile(join(repo, "test.txt"), "x");
    git("add", ".");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "t");
    const commit = git("rev-parse", "HEAD");

    const local: Fetcher = {
      file: () => Promise.resolve(FILE_BYTES),
      git: (_u, c, d) => networkFetcher.git(repo, c, d),
    };
    const s = spec({
      inputs: [{ kind: "git", path: "repo", url: "https://example.com/r.git", commit }],
    });
    const work = await mkdtemp(join(tmpdir(), "arl-work-"));
    await materialize(s, work, local);
    assert.deepEqual(await readdir(join(work, "repo")), ["test.txt"]);

    const other = spec({
      inputs: [
        { kind: "git", path: "repo", url: "https://example.com/r.git", commit: "e".repeat(40) },
      ],
    });
    await assert.rejects(
      materialize(other, await mkdtemp(join(tmpdir(), "arl-work-")), local),
      InputError,
    );
  });

  it("refuse a file whose hash differs", async () => {
    const wrong: Fetcher = {
      file: () => Promise.resolve(Buffer.from("other")),
      git: () => Promise.resolve(),
    };
    const s = spec({
      inputs: [{ kind: "file", path: "in.txt", url: "https://x.y/in", sha256: FILE_SHA }],
    });
    await assert.rejects(
      materialize(s, await mkdtemp(join(tmpdir(), "arl-work-")), wrong),
      /sha256/,
    );
  });
});

/** A runner that runs a function in place of the container. */
const fakeRunner = (
  job: (work: string, out: string) => Promise<number | null>,
  timedOut = false,
): ContainerRunner => ({
  async run(_s, work, out) {
    return { exitCode: await job(work, out), timedOut };
  },
});
const files: Fetcher = { file: () => Promise.resolve(FILE_BYTES), git: () => Promise.resolve() };
const fileSpec = () =>
  spec({
    inputs: [{ kind: "file", path: "data/in.txt", url: "https://x.y/in", sha256: FILE_SHA }],
    workdir: ".",
  });

describe("execute and decide", () => {
  const job = fakeRunner(async (_work, out) => {
    await writeFile(join(out, "result.json"), '{"passed":3,"failed":0}');
    return 0;
  });

  it("hashes declared outputs, sorted, with null for a missing one", async () => {
    const { result, hash } = await execute(fileSpec(), { runner: job, fetcher: files });
    assert.equal(result.spec_hash, specHash(fileSpec()));
    assert.deepEqual(result.outputs, [
      { path: "coverage/lcov.info", sha256: null },
      { path: "result.json", sha256: sha256(Buffer.from('{"passed":3,"failed":0}')) },
    ]);
    assert.equal(hash, resultHash(result));
    // Deterministic: a second run gives the same deliverable.
    assert.equal((await execute(fileSpec(), { runner: job, fetcher: files })).hash, hash);
  });

  it("does not follow a symlinked output", async () => {
    const linking = fakeRunner(async (_w, out) => {
      await symlink("/etc/hostname", join(out, "result.json"));
      await mkdir(join(out, "coverage"));
      return 0;
    });
    const { result } = await execute(fileSpec(), { runner: linking, fetcher: files });
    assert.deepEqual(
      result.outputs.map((o) => o.sha256),
      [null, null],
    );
  });

  it("approves the matching deliverable", async () => {
    const { hash } = await execute(fileSpec(), { runner: job, fetcher: files });
    const d = await decide(fileSpec(), specHash(fileSpec()), hash, { runner: job, fetcher: files });
    assert.deepEqual([d.approve, d.reason, d.evidence], [true, "accepted", hash]);
  });

  it("rejects a different deliverable, a different spec and a timeout", async () => {
    const other: Hex = `0x${"1".repeat(64)}`;
    const wrongSpec: Hex = `0x${"2".repeat(64)}`;
    const d1 = await decide(fileSpec(), specHash(fileSpec()), other, {
      runner: job,
      fetcher: files,
    });
    assert.equal(d1.approve, false);
    assert.match(d1.reason, /differs/);

    const d2 = await decide(fileSpec(), wrongSpec, other, {
      runner: job,
      fetcher: files,
    });
    assert.deepEqual([d2.approve, d2.result], [false, null]);

    const slow = fakeRunner(() => Promise.resolve(null), true);
    const { hash } = await execute(fileSpec(), { runner: slow, fetcher: files });
    const d3 = await decide(fileSpec(), specHash(fileSpec()), hash, {
      runner: slow,
      fetcher: files,
    });
    assert.deepEqual([d3.approve, d3.reason], [false, "timed out"]);
  });

  it("gives the job the inputs and a writable work tree", async () => {
    const reading = fakeRunner(async (work, out) => {
      const { readFile, stat } = await import("node:fs/promises");
      assert.equal((await stat(work)).mode & 0o777, 0o777);
      await writeFile(join(out, "result.json"), await readFile(join(work, "data/in.txt")));
      return 0;
    });
    const { result } = await execute(fileSpec(), { runner: reading, fetcher: files });
    assert.equal(result.outputs[1]?.sha256, FILE_SHA);
  });
});

describe("chain gate", () => {
  it("allows Base Sepolia and local only", () => {
    checkChain(84_532);
    checkChain(31_337);
    assert.throws(() => {
      checkChain(8_453);
    }, ChainError);
    assert.throws(() => {
      checkChain(1);
    }, ChainError);
  });
});

// Pinned so that a change to canonicalization or to the spec type shows up as a test failure.
// Cross-checked independently: Python json.dumps(sort_keys=True, separators=(",", ":"),
// ensure_ascii=False) of the same spec, hashed with Foundry's `cast keccak`.
const SPEC_VECTOR = "0xbe6be4554f5411cd3ae6069caf03c96e2764a21e2b08a851fc6b83279a1f7690";
