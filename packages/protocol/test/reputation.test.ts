import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { ReputationError, reputationScore, type Outcome, type Score } from "../src/index.ts";

const vectors = JSON.parse(
  readFileSync(
    new URL("../../../spec/arl-reputation/v0.1.0/vectors.json", import.meta.url),
    "utf8",
  ),
) as { now: number; cases: { name: string; outcomes: Outcome[]; score: Score }[] };

describe("arl-reputation/1 vectors", () => {
  for (const c of vectors.cases) {
    it(`scores ${c.name}`, () => {
      assert.deepEqual(reputationScore(c.outcomes, vectors.now), c.score);
    });
  }
});

describe("reputation rules", () => {
  const base = vectors.cases.find((c) => c.name === "all-completed");
  assert.ok(base);
  const [first] = base.outcomes;
  assert.ok(first);

  it("refuses duplicate jobs and outcomes from the future", () => {
    assert.throws(() => reputationScore([first, first], vectors.now), ReputationError);
    assert.throws(
      () => reputationScore([{ ...first, final_at: vectors.now + 1 }], vectors.now),
      ReputationError,
    );
  });

  it("caps one client so it cannot buy a score", () => {
    const wash = vectors.cases.find((c) => c.name === "wash-client-capped");
    assert.ok(wash);
    // 20 large completed jobs from one client, three rejections from three others: the client is
    // held to a quarter of the weight, so the score is 25 %, not ~100 %.
    assert.equal(wash.score.score_bps, 2500);
  });

  it("never publishes a score below the minimum history", () => {
    const short = vectors.cases.find((c) => c.name === "too-little-history");
    assert.ok(short);
    assert.equal(short.score.score_bps, null);
  });
});
