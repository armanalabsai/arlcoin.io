import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, mock } from "node:test";

import { getContractAddress } from "viem";

import { parseRun, recordCommand } from "../../lib/deploySteps.ts";
import { TGE_DATE } from "../../lib/network.ts";
import { JOBS_V2_ARTIFACTS } from "../fixtures/deploy/jobsV2Artifacts.ts";
import { RELEASE_ARTIFACTS } from "../fixtures/deploy/releaseArtifacts.ts";

// The Base Mainnet contract run published for TGE day (apps/dapp/public/plans/8453-deploy.json),
// taken from the mainnet fork rehearsal with the real signers. It must load on the deploy screen
// once Base Mainnet opens and create exactly the addresses in docs/mainnet-plan.md. The Safe run
// names the Safe owners, so it stays out of the repository and is handed to the owner directly.
const plan = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../public/plans/${name}.json`, import.meta.url), "utf8"),
  ) as unknown;
const doc = readFileSync(new URL("../../../../docs/mainnet-plan.md", import.meta.url), "utf8");
const docServices = readFileSync(
  new URL("../../../../docs/mainnet-services.md", import.meta.url),
  "utf8",
);
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
    const run = afterTge(() => parseRun(plan("8453-deploy"), RELEASE_ARTIFACTS));
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
    const run = afterTge(() => parseRun(plan("8453-arbiter-safe"), RELEASE_ARTIFACTS));
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

  // Both plans were built before the audit fixes of 2026-10-28 (F-3: one-year cap on a job's
  // deadline) and were never signed. The current build refuses them; their -v2 replacements are
  // built from the fixed code.
  for (const name of ["8453-verified-jobs-usdc", "8453-verified-jobs-arl"]) {
    it(`refuses ${name}: pre-audit bytecode, do not use`, () => {
      assert.throws(() => afterTge(() => parseRun(plan(name))), /ARLJobs|code/);
    });
  }

  // Built from the code with the 2026-10-28 audit fixes (F-2, F-3) at the same nonces, and
  // executed. Their evaluators predate the fix of the 2026-10-31 report (acceptance closed when
  // voting started), so the current build refuses them; the tests read them against the build
  // they were made from.
  const pairs = [
    {
      name: "8453-verified-jobs-usdc-v2",
      nonce: 23,
      token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      jobs: "0xc833140D2eE8607fd41662cffFAc557f3D535bE6",
      evaluator: "0x4f7f61916d65ff9E7C5F62468a18E37d4Fb07FA7",
      record: "8453-jobs-usdc.json",
    },
    {
      name: "8453-verified-jobs-arl-v2",
      nonce: 25,
      token: "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4",
      jobs: "0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9",
      evaluator: "0xa2f8945f301C46f2649b79Cd42A7eb1102e9009E",
      record: "8453-jobs.json",
    },
  ];
  for (const p of pairs) {
    it(`creates ${p.name}: escrow at nonce ${String(p.nonce)} and its evaluator bonded in ARL`, () => {
      assert.throws(() => afterTge(() => parseRun(plan(p.name))), /ARLVerifiedEvaluator code/);
      const run = afterTge(() => parseRun(plan(p.name), JOBS_V2_ARTIFACTS));
      assert.deepEqual(
        run.steps.map((s) => (s.kind === "create" ? s.contract : s.kind)),
        ["ARLJobs", "ARLVerifiedEvaluator"],
      );
      const [jobs, evaluator] = run.steps;
      assert.equal(jobs?.kind, "create");
      assert.equal(evaluator?.kind, "create");
      if (jobs?.kind === "create" && evaluator?.kind === "create") {
        assert.equal(jobs.nonce, p.nonce);
        assert.equal(evaluator.nonce, p.nonce + 1);
        assert.equal(jobs.address, getContractAddress({ from: run.from, nonce: BigInt(p.nonce) }));
        assert.equal(jobs.address.toLowerCase(), p.jobs.toLowerCase());
        assert.equal(evaluator.address.toLowerCase(), p.evaluator.toLowerCase());
        assert.equal(String(jobs.args[0]).toLowerCase(), p.token.toLowerCase());
        assert.equal(String(evaluator.args[0]).toLowerCase(), p.jobs.toLowerCase());
        assert.equal(String(evaluator.args[1]), "0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f");
        assert.equal(evaluator.args[3], 100n * 10n ** 18n);
        assert.ok(doc.includes(p.jobs) || docServices.includes(p.jobs));
      }
      const record = recordCommand(run, "x.json");
      assert.equal(record.kind, "jobs");
      assert.ok(record.command.endsWith(p.record));
    });
  }
});
