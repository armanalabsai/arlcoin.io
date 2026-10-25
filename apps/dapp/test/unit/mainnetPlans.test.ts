import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, mock } from "node:test";

import { getContractAddress } from "viem";

import { parseRun, recordCommand } from "../../lib/deploySteps.ts";
import { TGE_DATE } from "../../lib/network.ts";

// The Base Mainnet contract run published for TGE day (apps/dapp/public/plans/8453-deploy.json),
// taken from the mainnet fork rehearsal with the real signers. It must load on the deploy screen
// once Base Mainnet opens and create exactly the addresses in docs/mainnet-plan.md. The Safe run
// names the Safe owners, so it stays out of the repository and is handed to the owner directly.
const plan = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../public/plans/${name}.json`, import.meta.url), "utf8"),
  ) as unknown;
const doc = readFileSync(new URL("../../../../docs/mainnet-plan.md", import.meta.url), "utf8");
const planned = (label: string) =>
  new RegExp(`\\| ${label} +\\| \`(0x[0-9a-fA-F]{40})\``).exec(doc)?.[1]?.toLowerCase();

const afterTge = <T>(f: () => T): T => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse(TGE_DATE) + 60_000 });
  try {
    return f();
  } finally {
    mock.timers.reset();
  }
};

describe("Base Mainnet plans for TGE day", () => {
  it("deploys the ARL contracts at nonces 12 to 15, the token at the planned address", () => {
    const run = afterTge(() => parseRun(plan("8453-deploy")));
    assert.equal(run.chainId, 8453);
    assert.deepEqual(
      run.steps.map((s) => (s.kind === "create" ? s.contract : s.kind)),
      ["ARLVestingWallet", "ARLVestingWallet", "ARLTimelock", "ARLToken"],
    );
    const token = run.steps[3];
    assert.equal(token?.kind, "create");
    if (token?.kind === "create") {
      assert.equal(token.nonce, 15);
      assert.equal(token.address, getContractAddress({ from: run.from, nonce: 15n }));
      assert.equal(token.address.toLowerCase(), planned("ARL token"));
    }
    assert.equal(run.from.toLowerCase(), "0xe033104ae32fc7e13263b7aed577ab20d6e47eaa");
    assert.ok(recordCommand(run, "x.json").command.includes(" https://mainnet.base.org "));
  });
});

// The network services on Base Mainnet (docs/mainnet-services.md): the arbiter Safe of the
// verified evaluator at nonce 19, the escrow paid in ARL at nonce 21 (nonce 20 was a plain transfer)
// and its evaluator at nonce 22 (signed from the earlier plan), then the escrow paid in USDC and its
// evaluator, bonded in ARL, at nonces 23 and 24.
describe("Base Mainnet plans for the verified jobs", () => {
  it("creates the 2-of-3 arbiter Safe of the three arbiters", () => {
    const run = afterTge(() => parseRun(plan("8453-arbiter-safe")));
    assert.equal(run.chainId, 8453);
    assert.equal(run.steps.length, 1);
    const safe = run.steps[0];
    assert.equal(safe?.kind, "safe");
    if (safe?.kind === "safe") {
      assert.equal(safe.nonce, 19);
      assert.equal(safe.threshold, 2n);
      assert.equal(safe.owners.length, 3);
    }
    const record = recordCommand(run, "x.json");
    assert.equal(record.kind, "arbiter");
    assert.ok(!record.command.includes("8453-safes.json"));
  });

  it("creates the escrow paid in USDC and its evaluator bonded in ARL at nonces 23 and 24", () => {
    const run = afterTge(() => parseRun(plan("8453-verified-jobs-usdc")));
    assert.deepEqual(
      run.steps.map((s) => (s.kind === "create" ? s.contract : s.kind)),
      ["ARLJobs", "ARLVerifiedEvaluator"],
    );
    const [jobs, evaluator] = run.steps;
    assert.equal(jobs?.kind, "create");
    assert.equal(evaluator?.kind, "create");
    if (jobs?.kind === "create" && evaluator?.kind === "create") {
      assert.equal(jobs.nonce, 23);
      assert.equal(String(jobs.args[0]), "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
      assert.equal(evaluator.nonce, 24);
      assert.equal(String(evaluator.args[0]).toLowerCase(), jobs.address.toLowerCase());
      assert.equal(String(evaluator.args[1]), "0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f");
      assert.equal(evaluator.args[3], 100n * 10n ** 18n);
      assert.equal(String(evaluator.args[6]).toLowerCase(), planned("ARL token"));
    }
    const record = recordCommand(run, "x.json");
    assert.equal(record.kind, "jobs");
    assert.ok(record.command.includes("8453-jobs-usdc.json"));
  });
});
