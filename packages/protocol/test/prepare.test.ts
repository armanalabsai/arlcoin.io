import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { decodeFunctionData, type Address } from "viem";

import {
  BASE_MAINNET_TASK_DEPLOYMENTS,
  BUILTIN_POLICIES,
  PolicyError,
  TaskError,
  builtinPolicy,
  fundingTransactions,
  openTaskAbi,
  parsePolicy,
  prepareTask,
  taskDeployment,
  taskHash,
  parseTask,
} from "../src/index.ts";

const vectors = JSON.parse(
  readFileSync(new URL("../../../spec/arl-task/v0.1.0/vectors.json", import.meta.url), "utf8"),
) as { valid: { name: string; task: Record<string, unknown> }[] };

const reexec = vectors.valid.find((v) => v.name === "reexec-arl");
assert.ok(reexec);

const CLIENT: Address = "0x1111111111111111111111111111111111111111";
const PROVIDER: Address = "0x2222222222222222222222222222222222222222";
const COMMITTEE: Address[] = [
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
  "0x5555555555555555555555555555555555555555",
];
const ARL = BASE_MAINNET_TASK_DEPLOYMENTS.ARL;
const input = {
  task: reexec.task,
  taskUri: "https://example.com/task.json",
  client: CLIENT,
  provider: PROVIDER,
  committee: COMMITTEE,
  deployment: ARL,
  now: 1_800_000_000n,
};

describe("built-in policies", () => {
  it("equal the spec's policy documents", () => {
    for (const id of ["reexec-standard", "fallback-review", "model-assisted-review"]) {
      const file = parsePolicy(
        JSON.parse(
          readFileSync(
            new URL(`../../../spec/arl-policy/v0.1.0/policies/${id}.json`, import.meta.url),
            "utf8",
          ),
        ),
      );
      assert.deepEqual(BUILTIN_POLICIES.get(id), file);
      assert.deepEqual(builtinPolicy(`arl-policy/1:${id}`), file);
    }
    assert.equal(BUILTIN_POLICIES.size, 3);
    assert.equal(builtinPolicy("arl-policy/1:nope"), undefined);
    assert.equal(builtinPolicy("reexec-standard"), undefined);
  });
});

describe("task deployments", () => {
  it("pair each token with its escrow and evaluator on Base Mainnet only", () => {
    const docs = readFileSync(
      new URL("../../../docs/mainnet-services.md", import.meta.url),
      "utf8",
    );
    for (const d of Object.values(BASE_MAINNET_TASK_DEPLOYMENTS)) {
      for (const a of [d.jobs, d.evaluator, d.arbiter]) assert.ok(docs.includes(a), a);
    }
    assert.equal(taskDeployment(8453, "USDC"), BASE_MAINNET_TASK_DEPLOYMENTS.USDC);
    assert.equal(taskDeployment(31_337, "ARL"), undefined);
  });
});

describe("prepareTask", () => {
  it("encodes createJob with the task's terms", () => {
    const p = prepareTask(input);
    assert.equal(p.taskHash, taskHash(parseTask(reexec.task)));
    assert.equal(p.policy.id, "reexec-standard");
    assert.equal(p.create.to, ARL.jobs);
    assert.equal(p.create.value, "0");
    const { functionName, args } = decodeFunctionData({ abi: openTaskAbi, data: p.create.data });
    assert.equal(functionName, "createJob");
    assert.deepEqual(args, [
      PROVIDER,
      ARL.evaluator,
      1_800_000_000n + 72n * 3600n,
      `arl-task:${p.taskHash} https://example.com/task.json`,
      "0x0000000000000000000000000000000000000000",
    ]);
  });

  it("encodes configure, setBudget, approve and fund for the created job", () => {
    const p = prepareTask(input);
    const txs = fundingTransactions(p, 7n);
    assert.deepEqual(
      txs.map((t) => [t.step, t.to]),
      [
        ["configure", ARL.evaluator],
        ["setBudget", ARL.jobs],
        ["approve", ARL.token],
        ["fund", ARL.jobs],
      ],
    );
    const decoded = txs.map((t) => decodeFunctionData({ abi: openTaskAbi, data: t.data }));
    const cfg = decoded[0]?.args[1] as unknown as {
      committee: readonly Address[];
      specHash: string;
      tier: number;
    };
    assert.deepEqual(decoded[0]?.args[0], 7n);
    assert.deepEqual(cfg.committee, COMMITTEE);
    assert.equal(cfg.tier, 1);
    assert.equal(cfg.specHash, (reexec.task.workload as { spec_hash: string }).spec_hash);
    const budget = 10n * 10n ** 18n;
    assert.deepEqual(decoded[1]?.args, [7n, budget, "0x"]);
    assert.deepEqual(decoded[2]?.args, [ARL.jobs, budget]);
    assert.deepEqual(decoded[3]?.args, [7n, budget, "0x"]);
  });

  it("refuses the arbiter as client, provider or member, and a client paying itself", () => {
    const [a, b] = COMMITTEE as [Address, Address];
    for (const bad of [
      { client: ARL.arbiter },
      { provider: ARL.arbiter },
      { committee: [a, b, ARL.arbiter] },
      { provider: CLIENT },
    ]) {
      assert.throws(() => prepareTask({ ...input, ...bad }), TaskError);
    }
  });

  it("refuses a task that breaks its policy or names an unknown one", () => {
    const v = reexec.task.verification as Record<string, unknown>;
    // reexec-standard allows challenge windows up to 3 days.
    assert.throws(
      () =>
        prepareTask({
          ...input,
          task: {
            ...reexec.task,
            payment: { ...(reexec.task.payment as object), deadline_hours: 720 },
            verification: { ...v, challenge_window_seconds: 7 * 86400 },
          },
        }),
      PolicyError,
    );
    assert.throws(
      () =>
        prepareTask({
          ...input,
          task: { ...reexec.task, verification: { ...v, policy: "arl-policy/1:custom" } },
        }),
      /unknown policy/,
    );
    assert.throws(() => prepareTask({ ...input, task: { ...reexec.task, extra: 1 } }), TaskError);
  });
});
