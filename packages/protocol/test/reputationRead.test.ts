import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  outcomesFromChain,
  reputationScore,
  type EvaluatorLogs,
  type FeedbackRecord,
  type JobRecord,
} from "../src/index.ts";

const EVAL = "0x0D160C869bd2a7AaEDd29e11fc60fdAEf21c3E28";
const ESCROW = "0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC";
const AGENT = 42n;
const h = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as const;
const client = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as const;
const ARL = 10n ** 18n;

function logs(over: Partial<EvaluatorLogs> = {}): EvaluatorLogs {
  return {
    evaluator: EVAL,
    escrow: ESCROW,
    token: "ARL",
    configured: [1n, 2n, 3n, 4n, 5n, 6n].map((jobId) => ({ jobId, providerAgentId: AGENT })),
    committeeApproved: [1n, 2n, 3n, 4n, 5n],
    unbound: [],
    finalized: [
      { jobId: 1n, voteHash: h(1) },
      { jobId: 2n, voteHash: h(2) },
    ],
    disputed: [2n],
    failed: [4n],
    ...over,
  };
}

const feedback = (
  n: number,
  value: bigint,
  over: Partial<FeedbackRecord> = {},
): FeedbackRecord => ({
  evaluator: EVAL,
  agentId: AGENT,
  value,
  valueDecimals: 0,
  tag1: "arl-verified",
  feedbackHash: h(n),
  timestamp: 1_000 + n,
  ...over,
});

const jobs: JobRecord[] = [
  { escrow: ESCROW, jobId: 1n, client: client(1), budget: 100n * ARL, status: "Completed" },
  { escrow: ESCROW, jobId: 2n, client: client(2), budget: 50n * ARL, status: "Rejected" },
  {
    escrow: ESCROW,
    jobId: 3n,
    client: client(3),
    budget: 10n * ARL,
    status: "Expired",
    expiredAt: 2_000,
  },
  {
    escrow: ESCROW,
    jobId: 4n,
    client: client(3),
    budget: 10n * ARL,
    status: "Expired",
    expiredAt: 2_100,
  },
  { escrow: ESCROW, jobId: 5n, client: client(3), budget: 10n * ARL, status: "Funded" },
  {
    escrow: ESCROW,
    jobId: 6n,
    client: client(3),
    budget: 10n * ARL,
    status: "Expired",
    expiredAt: 2_200,
  },
];

describe("arl-reputation/1 read path", () => {
  it("joins evaluator feedback to jobs and adds jobs the agent took and let expire", () => {
    const { outcomes, skipped } = outcomesFromChain(
      AGENT,
      [feedback(1, 100n), feedback(2, 0n)],
      [logs()],
      jobs,
    );
    assert.deepEqual(skipped, []);
    assert.deepEqual(
      outcomes.map((o) => [
        o.job.split(":")[1],
        o.outcome,
        o.client,
        o.budget,
        o.final_at,
        o.disputed,
      ]),
      [
        ["1", "completed", client(1), (100n * ARL).toString(), 1_001, false],
        ["2", "rejected", client(2), (50n * ARL).toString(), 1_002, true],
        // job 3: took the job, refunded after the deadline. job 4: the committee failed (excluded).
        // job 5: still funded. job 6: the agent never approved the committee (never took it).
        ["3", "expired", client(3), (10n * ARL).toString(), 2_000, false],
      ],
    );
    const score = reputationScore(outcomes, 3_000);
    assert.equal(score.outcomes, 3);
    assert.equal(score.completed, 1);
  });

  it("counts only the deployed evaluators' arl-verified feedback for this agent", () => {
    const others = [
      feedback(1, 100n, { evaluator: client(99) }), // anyone else writing feedback
      feedback(1, 100n, { tag1: "starred" }),
      feedback(1, 100n, { agentId: 7n }),
      feedback(1, 100n, { revoked: true }),
    ];
    const { outcomes } = outcomesFromChain(AGENT, others, [logs({ committeeApproved: [] })], jobs);
    assert.deepEqual(outcomes, []);
  });

  it("reports feedback it cannot join instead of guessing", () => {
    const { outcomes, skipped } = outcomesFromChain(
      AGENT,
      [feedback(9, 100n), feedback(1, 50n), feedback(1, 100n), feedback(1, 100n, { timestamp: 5 })],
      [logs({ committeeApproved: [] })],
      jobs,
    );
    assert.equal(outcomes.length, 1);
    assert.deepEqual(
      skipped.map((s) => s.reason),
      ["0 finalized jobs carry this vote hash", "value is not 100 or 0", "job 1 already counted"],
    );
  });

  it("skips a job configured for another agent", () => {
    const { outcomes, skipped } = outcomesFromChain(
      AGENT,
      [feedback(1, 100n)],
      [logs({ configured: [{ jobId: 1n, providerAgentId: 8n }], committeeApproved: [] })],
      jobs,
    );
    assert.deepEqual(outcomes, []);
    assert.match(skipped[0]?.reason ?? "", /not configured for this agent/);
  });
});
