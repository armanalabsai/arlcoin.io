import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { canonicalHash, fetchJobSpec, specHash, specUriOf } from "../src/index.ts";

const vectors = JSON.parse(
  readFileSync(new URL("../../../spec/arl-task/v0.1.0/vectors.json", import.meta.url), "utf8"),
) as { valid: { name: string; task: Record<string, unknown>; taskHash: string }[] };

const reexec = vectors.valid.find((v) => v.name === "reexec-arl");
const model = vectors.valid.find((v) => v.name === "model-assisted-usdc");
assert.ok(reexec && model);

const SPEC_URI = (reexec.task.workload as { spec_uri: string }).spec_uri;
const SPEC_HASH = (reexec.task.workload as { spec_hash: string }).spec_hash;
const spec = readFileSync(new URL("../examples/busybox-summary.json", import.meta.url));
const TASK_URI = "https://tasks.example/t.json";

/** Serves `files` by URI; anything else fails like an unreachable host. */
function fetcher(files: Record<string, unknown>) {
  return {
    file: (uri: string) => {
      const f = files[uri];
      if (f === undefined) return Promise.reject(new Error(`unreachable ${uri}`));
      return Promise.resolve(Buffer.isBuffer(f) ? f : Buffer.from(JSON.stringify(f)));
    },
  };
}

describe("arl-task/1 job descriptions", () => {
  it("resolves a task description to the task's workload spec", async () => {
    const description = `arl-task:${reexec.taskHash} ${TASK_URI}`;
    const f = fetcher({ [TASK_URI]: reexec.task, [SPEC_URI]: spec });
    assert.equal(await specUriOf(description, f), SPEC_URI);
    assert.equal(specHash(await fetchJobSpec(description, f)), SPEC_HASH);
  });

  it("keeps a plain spec URI as it is", async () => {
    assert.equal(await specUriOf(SPEC_URI, fetcher({})), SPEC_URI);
  });

  it("refuses a task that does not match the hash, is not reexec or is too large", async () => {
    const other = { ...reexec.task, title: "Another task" };
    await assert.rejects(
      specUriOf(`arl-task:${reexec.taskHash} ${TASK_URI}`, fetcher({ [TASK_URI]: other })),
      /does not match its hash/,
    );
    await assert.rejects(
      specUriOf(`arl-task:${model.taskHash} ${TASK_URI}`, fetcher({ [TASK_URI]: model.task })),
      /not a reexec/,
    );
    const big = Buffer.alloc(64 * 1024 + 1, 32);
    await assert.rejects(
      specUriOf(`arl-task:${reexec.taskHash} ${TASK_URI}`, fetcher({ [TASK_URI]: big })),
      /too large/,
    );
    assert.equal(canonicalHash(reexec.task), reexec.taskHash);
  });

  it("does not follow a malformed task description", async () => {
    // Upper-case hash or an http URI is not the arl-task form: it stays a (refused) spec URI.
    const upper = `arl-task:${reexec.taskHash.toUpperCase().replace("0X", "0x")} ${TASK_URI}`;
    assert.equal(await specUriOf(upper, fetcher({})), upper);
    await assert.rejects(
      fetchJobSpec(`arl-task:${reexec.taskHash} http://x/t.json`, fetcher({})),
      /https or ipfs/,
    );
  });
});
