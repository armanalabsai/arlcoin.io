import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getAddress, type Address } from "viem";

import {
  WATCHED,
  scan,
  stringifyArgs,
  summary,
  type EventsClient,
  type EventsConfig,
  type LogLike,
} from "../src/events.ts";

const config = JSON.parse(
  readFileSync(new URL("../../../contracts/deploy/events-8453.json", import.meta.url), "utf8"),
) as EventsConfig;

/** A chain with logs by event name; it refuses ranges wider than `cap`, like public RPCs. */
function fakeClient(head: bigint, logs: Record<string, LogLike[]>, cap = 1_000n): EventsClient {
  return {
    getBlockNumber: () => Promise.resolve(head),
    getLogs: (p) => {
      if (p.toBlock - p.fromBlock + 1n > cap) return Promise.reject(new Error("range too wide"));
      const name = p.event.name;
      return Promise.resolve(
        (logs[name] ?? []).filter(
          (l) =>
            l.blockNumber !== null &&
            l.blockNumber >= p.fromBlock &&
            l.blockNumber <= p.toBlock &&
            p.address.includes(l.address),
        ),
      );
    },
  };
}

const evaluator = config.evaluators[0] as Address;
const jobs = config.jobs[0] as Address;

describe("protocol event alerts (S-4)", () => {
  it("watches the mainnet contracts named in the docs", () => {
    const docs = readFileSync(
      new URL("../../../docs/mainnet-services.md", import.meta.url),
      "utf8",
    );
    for (const a of [...config.jobs, ...config.evaluators, ...config.staking])
      assert.ok(docs.includes(getAddress(a)), a);
    assert.equal(config.chainId, 8453);
  });

  it("alerts on disputes, slashes, refused refunds, expired disputes and failed feedback only", () => {
    const alerts = WATCHED.filter((w) => w.level === "alert").map((w) => w.event.name);
    assert.deepEqual(alerts.sort(), [
      "DisputeExpired",
      "Disputed",
      "FeedbackFailed",
      "RefundDeferred",
      "Slashed",
    ]);
    for (const w of WATCHED) if (w.level === "alert") assert.ok(w.action);
  });

  it("scans in bounded windows, sorts by block and counts alerts", async () => {
    const client = fakeClient(10_500n, {
      Disputed: [
        {
          address: evaluator,
          blockNumber: 10_400n,
          transactionHash: "0xdd",
          args: { jobId: 3n, challenger: evaluator, evidence: "0x00" },
        },
      ],
      JobFunded: [
        {
          address: jobs,
          blockNumber: 8_100n,
          transactionHash: "0xaa",
          args: { jobId: 3n, amount: 5n },
        },
        // Outside the scanned range.
        { address: jobs, blockNumber: 7_000n, transactionHash: "0xbb", args: { jobId: 1n } },
      ],
    });
    const report = await scan(client, config, 8_000n);
    assert.equal(report.alerts, 1);
    assert.deepEqual(
      report.findings.map((f) => [f.event, f.block, f.level]),
      [
        ["JobFunded", "8100", "info"],
        ["Disputed", "10400", "alert"],
      ],
    );
    assert.equal(report.findings[1]?.args.jobId, "3");
    const md = summary(report);
    assert.ok(md.includes("**ALERT** Disputed"));
    assert.ok(md.includes("arbiterDeadline"));
  });

  it("reports a quiet range as no events", async () => {
    const report = await scan(fakeClient(5_000n, {}), config, 4_000n);
    assert.equal(report.alerts, 0);
    assert.ok(summary(report).includes("No events."));
  });

  it("stringifies decoded arguments", () => {
    assert.deepEqual(stringifyArgs({ a: 1n, b: true, c: "x" }), { a: "1", b: "true", c: "x" });
    assert.deepEqual(stringifyArgs(undefined), {});
  });
});
