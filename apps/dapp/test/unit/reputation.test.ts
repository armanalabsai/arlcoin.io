import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { keccak256 } from "viem";
import type { Address } from "viem";

import {
  decodeJobFeedback,
  encodeJobFeedback,
  starsToValue,
  summarise,
  verifiedRatings,
} from "../../lib/reputation.ts";
import type { FeedbackEvent, JobFeedback, JobView } from "../../lib/reputation.ts";

const CLIENT: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const OTHER: Address = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const PAY_TO: Address = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const JOBS: Address = "0x0165878A594ca255338adfa4d48449f69242Eb8F";
const AT = new Date("2026-09-29T12:00:00Z");

const feedback = (over: Partial<JobFeedback> = {}): JobFeedback => ({
  chainId: 31337,
  agentId: 1n,
  client: CLIENT,
  jobs: JOBS,
  jobId: 1n,
  value: 80,
  ...over,
});

const event = (f: JobFeedback, index = 1n, over: Partial<FeedbackEvent> = {}): FeedbackEvent => {
  const { uri, hash } = encodeJobFeedback(f, AT);
  return {
    agentId: f.agentId,
    client: f.client,
    index,
    value: BigInt(f.value),
    valueDecimals: 0,
    tag1: "starred",
    tag2: "arl-job",
    uri,
    hash,
    ...over,
  };
};

const job = (over: Partial<JobView> = {}): JobView => ({
  client: CLIENT,
  provider: PAY_TO,
  status: "Completed",
  funded: true,
  ...over,
});

const ratings = (
  events: FeedbackEvent[],
  jobs: Map<bigint, JobView> = new Map([[1n, job()]]),
  revoked = new Set<string>(),
) =>
  verifiedRatings({
    chainId: 31337,
    agentId: 1n,
    payTo: PAY_TO,
    jobsAddress: JOBS,
    events,
    revoked,
    jobs,
  });

describe("job ratings", () => {
  it("maps stars to the 0-100 starred value", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5].map((s) => starsToValue(s)),
      [20, 40, 60, 80, 100],
    );
    assert.throws(() => starsToValue(0));
    assert.throws(() => starsToValue(2.5));
  });

  it("round-trips a feedback file and checks its hash", () => {
    const { uri, hash } = encodeJobFeedback(feedback(), AT);
    assert.ok(uri.startsWith("data:application/json;base64,"));
    assert.deepEqual(decodeJobFeedback(uri, hash, 31337), { ok: true, value: feedback() });
    assert.equal(decodeJobFeedback(uri, keccak256("0x00"), 31337).ok, false);
    assert.equal(decodeJobFeedback(uri, hash, 84532).ok, false);
    assert.equal(decodeJobFeedback("https://example.com/f.json", hash, 31337).ok, false);
  });

  it("counts a rating of a paid job by its client for this provider", () => {
    assert.deepEqual(ratings([event(feedback())]), [{ jobId: 1n, client: CLIENT, value: 80 }]);
  });

  it("ignores ratings that are not backed by a paid job", () => {
    const cases: [FeedbackEvent[], Map<bigint, JobView>][] = [
      // no such job
      [[event(feedback({ jobId: 9n }))], new Map([[1n, job()]])],
      // job never funded (cancelled while open)
      [[event(feedback())], new Map([[1n, job({ status: "Rejected", funded: false })]])],
      // job still running
      [[event(feedback())], new Map([[1n, job({ status: "Submitted" })]])],
      // written by someone who was not the job's client
      [[event(feedback({ client: OTHER }))], new Map([[1n, job()]])],
      // the job paid another provider
      [[event(feedback())], new Map([[1n, job({ provider: OTHER })]])],
      // a job on another jobs contract
      [[event(feedback({ jobs: OTHER }))], new Map([[1n, job()]])],
    ];
    for (const [events, jobs] of cases) assert.deepEqual(ratings(events, jobs), []);
  });

  it("ignores events that do not match their file", () => {
    const f = feedback();
    assert.deepEqual(ratings([event(f, 1n, { value: 100n })]), []);
    assert.deepEqual(ratings([event(f, 1n, { client: OTHER })]), []);
    assert.deepEqual(ratings([event(f, 1n, { tag2: "other" })]), []);
    assert.deepEqual(ratings([event(f, 1n, { valueDecimals: 2 })]), []);
    assert.deepEqual(ratings([event(f, 1n, { agentId: 2n })]), []);
    assert.deepEqual(ratings([event(f, 1n, { hash: keccak256("0x01") })]), []);
  });

  it("counts one rating per job: the latest, unless revoked", () => {
    const first = event(feedback({ value: 20 }), 1n);
    const second = event(feedback({ value: 100 }), 2n);
    assert.deepEqual(ratings([first, second]), [{ jobId: 1n, client: CLIENT, value: 100 }]);
    assert.deepEqual(ratings([first, second], undefined, new Set([`${CLIENT}:2`])), []);
    assert.deepEqual(ratings([first, second], undefined, new Set([`${CLIENT}:1`])), [
      { jobId: 1n, client: CLIENT, value: 100 },
    ]);
  });

  it("summarises", () => {
    assert.deepEqual(summarise([]), { count: 0 });
    assert.deepEqual(
      summarise([
        { jobId: 1n, client: CLIENT, value: 80 },
        { jobId: 2n, client: CLIENT, value: 100 },
        { jobId: 3n, client: OTHER, value: 60 },
      ]),
      { count: 3, average: 80 },
    );
  });
});
