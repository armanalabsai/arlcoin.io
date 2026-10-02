import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  BYTECODE_SCHEMA,
  compareRuntime,
  diffManifest,
  maskImmutables,
  readArtifact,
  readCompilerSettings,
  type Artifact,
  type BytecodeManifest,
} from "../src/bytecode.ts";

// A 16-byte runtime with one immutable written twice (bytes 2–5 and 10–13), as solc emits it.
const artifact: Artifact = {
  name: "X",
  creation: "0x6080",
  runtime: "0x60800000000060016002000000006003",
  immutables: [
    [
      { start: 2, length: 4 },
      { start: 10, length: 4 },
    ],
  ],
};
const deployed = (a: string, b = a) => `0x6080${a}60016002${b}6003` as const;

describe("runtime comparison", () => {
  it("matches a deployment that differs only in its immutable value", () => {
    const r = compareRuntime(artifact, deployed("deadbeef"));
    assert.deepEqual(r, { match: true, immutableValues: ["0xdeadbeef"] });
    assert.equal(maskImmutables(artifact, deployed("deadbeef")), artifact.runtime);
  });

  it("refuses other code, other sizes, no code and inconsistent immutables", () => {
    assert.equal(compareRuntime(artifact, "0x").match, false);
    assert.match(compareRuntime(artifact, "0x6080").reason ?? "", /runtime size 2/);
    const changed = deployed("deadbeef").replace("6001", "6009") as `0x${string}`;
    assert.equal(compareRuntime(artifact, changed).reason, "runtime code differs from the build");
    assert.equal(
      compareRuntime(artifact, deployed("deadbeef", "deadbeee")).reason,
      "an immutable differs between its copies",
    );
  });
});

describe("build manifest", () => {
  const manifest = (): BytecodeManifest => ({
    schema: BYTECODE_SCHEMA,
    compiler: { solc: "0.8.36", evmVersion: "cancun", optimizerRuns: 200, viaIR: false },
    contracts: { A: { creationHash: "0x01", runtimeHash: "0x02", runtimeSize: 10 } },
  });

  it("agrees with itself and names every difference", () => {
    assert.deepEqual(diffManifest(manifest(), manifest()), []);
    const built = manifest();
    built.compiler.solc = "0.8.37";
    built.contracts.A = { creationHash: "0x01", runtimeHash: "0x03", runtimeSize: 10 };
    built.contracts.B = { creationHash: "0x04", runtimeHash: "0x05", runtimeSize: 1 };
    assert.deepEqual(diffManifest(manifest(), built), [
      "compiler.solc: 0.8.36 ≠ 0.8.37",
      "A.runtimeHash: 0x02 ≠ 0x03",
      "B: missing from the manifest",
    ]);
  });

  it("reads settings only from a build without a metadata hash", () => {
    const dir = mkdtempSync(join(tmpdir(), "arl-bytecode-"));
    const toml = (extra: string) => {
      const f = join(dir, `foundry-${String(Math.random())}.toml`);
      writeFileSync(
        f,
        `[profile.default]\nsolc_version = "0.8.36"\nevm_version = "cancun"\noptimizer_runs = 200\nvia_ir = false\n${extra}\n[profile.zk]\nsolc_version = "0.8.1"\n`,
      );
      return f;
    };
    assert.deepEqual(readCompilerSettings(toml('bytecode_hash = "none"\ncbor_metadata = false')), {
      solc: "0.8.36",
      evmVersion: "cancun",
      optimizerRuns: 200,
      viaIR: false,
    });
    assert.throws(
      () => readCompilerSettings(toml('bytecode_hash = "ipfs"\ncbor_metadata = true')),
      /metadata/,
    );
  });

  it("reads forge artifacts with their immutable references", () => {
    const out = mkdtempSync(join(tmpdir(), "arl-out-"));
    mkdirSync(join(out, "X.sol"));
    writeFileSync(
      join(out, "X.sol", "X.json"),
      JSON.stringify({
        bytecode: { object: artifact.creation },
        deployedBytecode: {
          object: artifact.runtime,
          immutableReferences: { "7": artifact.immutables[0] },
        },
      }),
    );
    assert.deepEqual(readArtifact(out, "X"), artifact);
  });
});
