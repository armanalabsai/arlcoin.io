import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { DeploymentRecord } from "../src/manifest.ts";
import {
  MonitorError,
  assess,
  expectedRoles,
  expectedVested,
  roleKey,
  type Snapshot,
  type VestingState,
} from "../src/monitor.ts";
import { buildPlan, type DeployConfig } from "../src/plan.ts";

const LOCAL = JSON.parse(
  readFileSync(new URL("../../../contracts/deploy/config/local.json", import.meta.url), "utf8"),
) as DeployConfig;
const plan = buildPlan(LOCAL);
const deployment: DeploymentRecord = {
  chainId: 31337,
  deployer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  token: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  investorsVesting: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  partnershipsVesting: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  timelock: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
};

const vesting = (key: "investors" | "strategicPartnerships"): VestingState => {
  const v = plan.vesting[key];
  return {
    owner: v.beneficiary,
    cliffStart: BigInt(v.cliffStart),
    cliffEnd: BigInt(v.cliffEnd),
    vestingEnd: BigInt(v.vestingEnd),
    balance: BigInt(plan.allocations[key] ?? "0"),
    released: 0n,
    vested: 0n,
  };
};

/** A healthy deployment, read just after genesis. */
function healthy(): Snapshot {
  const roles = new Map<string, boolean>();
  for (const r of expectedRoles(plan, deployment)) roles.set(roleKey(r.role, r.account), r.want);
  return {
    chainId: 31337,
    blockNumber: 100n,
    timestamp: BigInt(plan.vesting.investors.cliffStart),
    totalSupply: 21_000_000n * 10n ** 18n,
    minDelay: BigInt(plan.treasury.minDelay),
    roles,
    vesting: {
      investors: vesting("investors"),
      strategicPartnerships: vesting("strategicPartnerships"),
    },
    operations: [],
    governanceEvents: [],
  };
}

const critical = (s: Snapshot) =>
  assess(plan, deployment, s)
    .findings.filter((f) => f.severity === "critical")
    .map((f) => f.check);

describe("deployment monitor", () => {
  it("reports a healthy deployment with no findings", () => {
    const r = assess(plan, deployment, healthy());
    assert.equal(r.healthy, true);
    assert.deepEqual(r.findings, []);
    assert.equal(r.checks, 2 + 2 + expectedRoles(plan, deployment).length + 2 * 5);
  });

  it("flags a supply change, a wrong chain and a lowered delay", () => {
    const s = healthy();
    s.totalSupply += 1n;
    s.chainId = 84532;
    s.minDelay = 3600n;
    assert.deepEqual(critical(s), [
      "chain id",
      "total supply",
      "timelock delay",
      "timelock delay floor",
    ]);
  });

  it("flags every role that drifts from the table", () => {
    for (const r of expectedRoles(plan, deployment)) {
      const s = healthy();
      s.roles.set(roleKey(r.role, r.account), !r.want);
      assert.deepEqual(critical(s), [
        `${r.who} ${r.want ? "holds" : "does not hold"} ${r.role} role`,
      ]);
    }
    const s = healthy();
    s.roles.delete(roleKey("proposer", plan.treasury.safe));
    assert.equal(assess(plan, deployment, s).findings[0]?.detail, "not read");
  });

  it("flags a vesting wallet that lost tokens, released early or changed hands", () => {
    const s = healthy();
    s.vesting.investors.balance -= 1n;
    s.vesting.strategicPartnerships.owner = deployment.deployer;
    assert.deepEqual(critical(s), [
      "investors vesting holds its allocation",
      "strategicPartnerships vesting beneficiary",
    ]);
    const early = healthy();
    early.vesting.investors.released = 1n;
    early.vesting.investors.balance -= 1n;
    assert.deepEqual(critical(early), ["investors vesting released no more than vested"]);
    const schedule = healthy();
    schedule.vesting.investors.cliffEnd += 1n;
    assert.deepEqual(critical(schedule), ["investors vesting schedule"]);
  });

  it("accepts tokens sent to a vesting wallet and releases along the schedule", () => {
    const s = healthy();
    s.vesting.investors.balance += 5n;
    const v = s.vesting.strategicPartnerships;
    s.timestamp = (v.cliffEnd + v.vestingEnd) / 2n;
    s.vesting.investors.vested = expectedVested(s.vesting.investors, s.timestamp);
    v.vested = expectedVested(v, s.timestamp);
    v.released = v.vested;
    v.balance -= v.released;
    assert.deepEqual(critical(s), []);
    v.vested += 1n;
    assert.deepEqual(critical(s), ["strategicPartnerships vesting follows the schedule"]);
  });

  it("follows the OpenZeppelin linear schedule from the cliff end", () => {
    const v = vesting("investors");
    const total = v.balance;
    assert.equal(expectedVested(v, v.cliffEnd - 1n), 0n);
    assert.equal(expectedVested(v, v.cliffEnd), 0n);
    assert.equal(expectedVested(v, (v.cliffEnd + v.vestingEnd) / 2n), total / 2n);
    assert.equal(expectedVested(v, v.vestingEnd), total);
    assert.equal(expectedVested(v, v.vestingEnd + 1n), total);
  });

  it("raises a notice for pending timelock operations and governance events", () => {
    const s = healthy();
    const call = { target: deployment.token, value: 0n, data: "0xa9059cbb00" as const };
    s.operations = [
      { id: "0x01", state: "Waiting", readyAt: 1_800_000_000n, calls: [call] },
      { id: "0x02", state: "Ready", readyAt: 1_700_000_000n, calls: [call] },
      { id: "0x03", state: "Done", readyAt: 0n, calls: [call] },
      { id: "0x04", state: "Unset", readyAt: 0n, calls: [call] },
    ];
    s.governanceEvents = [{ event: "RoleRevoked", detail: "canceller x by x", blockNumber: 7n }];
    const r = assess(plan, deployment, s);
    assert.equal(r.healthy, true);
    assert.deepEqual(
      r.findings.map((f) => [f.severity, f.check]),
      [
        ["notice", "timelock operation waiting"],
        ["notice", "timelock operation ready to execute"],
        ["notice", "timelock RoleRevoked"],
      ],
    );
    assert.match(
      r.findings[0]?.detail ?? "",
      /^0x01 ready at 2027-01-15T08:00:00.000Z: .* data 0xa9059cbb$/,
    );
  });

  it("refuses a deployment record from another chain", () => {
    assert.throws(() => assess(plan, { ...deployment, chainId: 1 }, healthy()), MonitorError);
  });
});
