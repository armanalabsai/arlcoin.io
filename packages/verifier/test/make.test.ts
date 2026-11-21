import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NODE_IMAGE, nodeTestSpec, parseSpec, specHash } from "../src/index.ts";

const REPO = "https://github.com/armanalabsai/arlcoin.io";
const COMMIT = "8a07287a8b7e459cfd64dddfbfe587864847f6d2";

describe("the spec of a verified test run", () => {
  it("pins the image, the commit and the directory, and accepts only passing tests", () => {
    const spec = nodeTestSpec({
      repository: REPO,
      commit: COMMIT,
      directory: "/examples/verified-tests/",
    });
    assert.equal(spec.container_digest, NODE_IMAGE);
    assert.deepEqual(spec.inputs, [{ kind: "git", path: "repo", url: REPO, commit: COMMIT }]);
    assert.equal(spec.workdir, "repo/examples/verified-tests");
    assert.equal(spec.expected_exit_code, 0);
    assert.deepEqual(spec.outputs, ["summary.txt"]);
    // What a validator parses is exactly what was built.
    assert.deepEqual(parseSpec(JSON.parse(JSON.stringify(spec))), spec);
  });

  it("hashes to the spec that was run in Docker for the example (docs/run-a-provider.md)", () => {
    const spec = nodeTestSpec({
      repository: REPO,
      commit: COMMIT,
      directory: "examples/verified-tests",
    });
    assert.equal(
      specHash(spec),
      "0x5e2d58f31b217799c32a9392abe998836751027704d16a1e8d64e81f91f6d21a",
    );
  });

  it("runs in the repository root by default and refuses a commit that is not one", () => {
    assert.equal(nodeTestSpec({ repository: REPO, commit: COMMIT }).workdir, "repo");
    assert.throws(() => nodeTestSpec({ repository: REPO, commit: "main" }));
    assert.throws(() => nodeTestSpec({ repository: "git@github.com:x/y.git", commit: COMMIT }));
  });
});
