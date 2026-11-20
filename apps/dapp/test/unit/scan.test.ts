import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAddressEqual } from "viem";
import type { Address } from "viem";

import type { Job, JobStatus } from "../../lib/jobs.ts";
import { agentRecords, creditScore, filterJobs, scanTotals } from "../../lib/scan.ts";

const A = "0x00000000000000000000000000000000000000aa" as Address;
const B = "0x00000000000000000000000000000000000000bb" as Address;
const C1 = "0x00000000000000000000000000000000000000c1" as Address;
const C2 = "0x00000000000000000000000000000000000000c2" as Address;
const EVAL = "0x00000000000000000000000000000000000000ee" as Address;
const VERIFIED = "0x0D160C869bd2a7AaEDd29e11fc60fdAEf21c3E28" as Address;
const ARL = 10n ** 18n;

let next = 1n;
function job(provider: Address, status: JobStatus, over: Partial<Job> = {}): Job {
  return {
    id: next++,
    client: C1,
    provider,
    evaluator: EVAL,
    description: "",
    budget: 10n * ARL,
    expiredAt: 0n,
    status,
    funded: status !== "Open",
    ...over,
  };
}

describe("ARLscan credit score", () => {
  it("is 0 without ended jobs and rises with the number of clean jobs", () => {
    assert.equal(creditScore(0, 0), 0);
    assert.equal(creditScore(0, 3), 0);
    const one = creditScore(1, 1);
    const ten = creditScore(10, 10);
    const fifty = creditScore(50, 50);
    assert.ok(one > 0 && one < ten && ten < fifty && fifty <= 100);
  });

  it("ranks a long record with one failure above a single lucky job", () => {
    assert.ok(creditScore(19, 20) > creditScore(1, 1));
  });

  it("matches the Wilson lower bound", () => {
    // p = 0.8, n = 10, z = 1.96: lower bound 0.4902
    assert.equal(creditScore(8, 10), 49);
  });
});

describe("ARLscan records", () => {
  const jobs = [
    job(A, "Completed", { evaluator: VERIFIED }),
    job(A, "Completed", { client: C2 }),
    job(A, "Rejected"),
    job(A, "Submitted"),
    job(A, "Rejected", { funded: false }), // cancelled while open: proves nothing
    job(B, "Completed", { budget: 5n * ARL }),
    job(B, "Open", { funded: false }),
    job(B, "Expired"),
  ];

  it("counts only funded jobs, per provider", () => {
    const [first, second] = agentRecords(jobs, VERIFIED);
    assert.ok(first && second);
    const a = [first, second].find((r) => isAddressEqual(r.provider, A));
    const b = [first, second].find((r) => isAddressEqual(r.provider, B));
    assert.ok(a && b);
    assert.deepEqual(
      [a.completed, a.rejected, a.expired, a.open, a.verified, a.clients, a.earned],
      [2, 1, 0, 1, 1, 2, 20n * ARL],
    );
    assert.deepEqual(
      [b.completed, b.rejected, b.expired, b.open, b.verified, b.clients, b.earned],
      [1, 0, 1, 0, 0, 1, 5n * ARL],
    );
    assert.equal(a.score, creditScore(2, 3));
    assert.ok(first.score >= second.score);
  });

  it("totals what was paid and what is still in escrow", () => {
    const t = scanTotals(jobs);
    assert.equal(t.jobs, 8);
    assert.equal(t.funded, 6);
    assert.equal(t.completed, 3);
    assert.equal(t.paid, 25n * ARL);
    assert.equal(t.escrowed, 10n * ARL);
    assert.equal(t.agents, 2);
    assert.equal(t.clients, 2);
  });

  it("finds jobs by id or by any party's address", () => {
    const first = jobs[0];
    assert.ok(first);
    assert.deepEqual(filterJobs(jobs, `#${first.id.toString()}`), [first]);
    assert.equal(filterJobs(jobs, "c2").length, 1);
    assert.equal(filterJobs(jobs, B.toUpperCase().replace("0X", "0x")).length, 3);
    assert.equal(filterJobs(jobs, "  ").length, jobs.length);
  });
});
