import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PublicClient } from "viem";

import {
  REPUTATION_REGISTRY,
  VERIFIED_EVALUATORS,
  getAgentScore,
  getJobAudit,
  getTrustGraph,
} from "../src/index.ts";

const ARL = VERIFIED_EVALUATORS[0];
const CLIENT_A = "0x00000000000000000000000000000000000000A1";
const CLIENT_B = "0x00000000000000000000000000000000000000b2";
const HEAD = ARL.fromBlock + 120_000n;
const NOW = 1_800_000_000n;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

/** Three jobs: agent 7 approved for A and rejected for B, agent 9 approved for A. */
const JOBS = [
  { jobId: 1n, agent: 7n, client: CLIENT_A, value: 100n, budget: 40n },
  { jobId: 2n, agent: 7n, client: CLIENT_B, value: 0n, budget: 10n },
  { jobId: 3n, agent: 9n, client: CLIENT_A, value: 100n, budget: 5n },
];

function fakeClient() {
  const calls = { logs: 0, jobs: 0 };
  const client = {
    getBlock: (a?: { blockNumber?: bigint }) =>
      Promise.resolve({ number: a?.blockNumber ?? HEAD, timestamp: NOW }),
    getLogs: (a: { address: unknown; fromBlock: bigint }) => {
      calls.logs += 1;
      if (a.fromBlock !== ARL.fromBlock) return Promise.resolve([]);
      if (a.address === REPUTATION_REGISTRY) {
        return Promise.resolve(
          JOBS.map((j) => ({
            address: REPUTATION_REGISTRY,
            eventName: "NewFeedback",
            blockNumber: ARL.fromBlock + j.jobId,
            transactionHash: hash(100 + Number(j.jobId)),
            args: {
              agentId: j.agent,
              clientAddress: ARL.evaluator,
              value: j.value,
              valueDecimals: 0,
              tag1: "arl-verified",
              feedbackHash: hash(Number(j.jobId)),
            },
          })),
        );
      }
      return Promise.resolve(
        JOBS.flatMap((j) => [
          {
            address: ARL.evaluator,
            eventName: "Configured",
            logIndex: 0,
            blockNumber: ARL.fromBlock,
            transactionHash: hash(200 + Number(j.jobId)),
            args: { jobId: j.jobId, providerAgentId: j.agent },
          },
          {
            address: ARL.evaluator,
            eventName: "CommitteeApproved",
            logIndex: 1,
            blockNumber: ARL.fromBlock,
            transactionHash: hash(300 + Number(j.jobId)),
            args: { jobId: j.jobId },
          },
          {
            address: ARL.evaluator,
            eventName: "Finalized",
            logIndex: 0,
            blockNumber: ARL.fromBlock + j.jobId,
            transactionHash: hash(100 + Number(j.jobId)),
            args: { jobId: j.jobId, approved: j.value === 100n, voteHash: hash(Number(j.jobId)) },
          },
        ]),
      );
    },
    readContract: (a: { args: readonly [bigint] }) => {
      calls.jobs += 1;
      const j = JOBS.find((x) => x.jobId === a.args[0]);
      assert.ok(j);
      return Promise.resolve({
        client: j.client,
        budget: j.budget,
        status: j.value === 100n ? 3 : 4,
      });
    },
  };
  return { client: client as unknown as PublicClient, calls };
}

describe("verified history", () => {
  it("scores one agent from the outcomes that are its own", async () => {
    const { client } = fakeClient();
    const r = await getAgentScore(client, 7n);
    assert.equal(r.block, HEAD);
    assert.deepEqual(
      r.outcomes.map((o) => [o.outcome, o.budget]),
      [
        ["completed", "40"],
        ["rejected", "10"],
      ],
    );
    assert.equal(r.score.score_bps, null); // two outcomes: below the minimum of three
    assert.equal((await getAgentScore(client, 8n)).outcomes.length, 0);
  });

  it("draws the trust graph: an edge per client and agent, from one read of the logs", async () => {
    const { client, calls } = fakeClient();
    const g = await getTrustGraph(client);
    assert.equal(g.block, HEAD);
    assert.deepEqual(
      g.agents.map((a) => a.agentId),
      [7n, 9n],
    );
    assert.deepEqual(
      g.edges.map((e) => [e.client.toLowerCase(), e.agentId, e.completed, e.rejected, e.paid.ARL]),
      [
        [CLIENT_A.toLowerCase(), 7n, 1, 0, "40"],
        [CLIENT_B.toLowerCase(), 7n, 0, 1, undefined],
        [CLIENT_A.toLowerCase(), 9n, 1, 0, "5"],
      ],
    );
    // Three 50,000-block ranges, two filters: the logs are read once for every agent.
    assert.equal(calls.logs, 6);
    assert.equal(calls.jobs, 3);
  });

  it("lists a job's events in order, with who acted", async () => {
    const { client } = fakeClient();
    const a = await getJobAudit(client, "ARL", 2n);
    assert.equal(a.block, HEAD);
    assert.deepEqual(
      a.entries.map((e) => [e.event, e.contract]),
      [
        ["Configured", "evaluator"],
        ["CommitteeApproved", "evaluator"],
        ["Finalized", "evaluator"],
      ],
    );
    assert.equal(a.entries[0]?.detail.providerAgentId, "7");
    assert.equal(a.entries[2]?.detail.approved, false);
    assert.match(a.entries[2]?.step ?? "", /finalized/);
    assert.equal((await getJobAudit(client, "USDC", 2n)).entries.length, 0);
  });
});
