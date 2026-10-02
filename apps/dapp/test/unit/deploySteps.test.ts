import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getContractAddress } from "viem";

import {
  DeployRunError,
  SAFE_FACTORY_V150,
  checkBeforeSend,
  describeStep,
  parseRun,
} from "../../lib/deploySteps.ts";
import { NetworkLocked } from "../../lib/network.ts";

// Dry-run files from the local deployment rehearsal (Anvil development accounts, no keys).
const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/deploy/${name}.json`, import.meta.url), "utf8")) as {
    chain: number;
    transactions: {
      transactionType: string;
      contractName: string | null;
      contractAddress: string;
      transaction: Record<string, unknown>;
    }[];
  };

const refused = (run: unknown, pattern: RegExp) =>
  assert.throws(
    () => parseRun(run),
    (e: unknown) => e instanceof DeployRunError && pattern.test(e.message),
  );

describe("deployment run file", () => {
  it("reads the ARL contract creations and checks their code and addresses", () => {
    const run = parseRun(load("DeployARL"));
    assert.equal(run.chainId, 31337);
    assert.deepEqual(
      run.steps.map((s) => (s.kind === "create" ? s.contract : s.kind)),
      ["ARLVestingWallet", "ARLVestingWallet", "ARLTimelock", "ARLToken"],
    );
    for (const s of run.steps) {
      assert.equal(s.kind, "create");
      if (s.kind === "create") {
        assert.equal(s.address, getContractAddress({ from: run.from, nonce: BigInt(s.nonce) }));
      }
    }
    const [vesting, , timelock, token] = run.steps.map(describeStep);
    assert.equal(vesting?.title, "Create a vesting wallet");
    assert.match(
      vesting?.detail ?? "",
      /nothing vests before 2028-01-01, then linearly until 2031-01-01/,
    );
    assert.match(timelock?.detail ?? "", /delay of 48 hours/);
    assert.match(token?.detail ?? "", /21,000,000 ARL once/);
  });

  it("reads Safe creations with their owners and threshold", () => {
    const run = parseRun(load("CreateSafes"));
    assert.equal(run.steps.length, 12);
    const first = run.steps[0];
    assert.equal(first?.kind, "safe");
    if (first?.kind === "safe") {
      assert.equal(first.owners.length, 3);
      assert.equal(first.threshold, 2n);
      assert.match(describeStep(first).title, /Create a Safe \(2 of 3\)/);
    }
  });

  it("refuses Base Mainnet, other code, ETH transfers, nonce gaps and unknown contracts", () => {
    assert.throws(() => parseRun({ ...load("DeployARL"), chain: 8453 }), NetworkLocked);
    const tamper = (f: (r: ReturnType<typeof load>) => void) => {
      const r = load("DeployARL");
      f(r);
      return r;
    };
    refused(
      tamper((r) => {
        const t = r.transactions[3]!.transaction;
        t.input = `${String(t.input).slice(0, 100)}ff${String(t.input).slice(102)}`;
      }),
      /ARLToken code is not the ARL build/,
    );
    refused(
      tamper((r) => (r.transactions[0]!.transaction.value = "0x1")),
      /sends ETH/,
    );
    refused(
      tamper((r) => (r.transactions[1]!.transaction.nonce = "0x99")),
      /not consecutive/,
    );
    refused(
      tamper((r) => (r.transactions[0]!.contractName = "Evil")),
      /unknown contract/,
    );
    refused(
      tamper((r) => (r.transactions[1]!.transaction.from = SAFE_FACTORY_V150)),
      /another sender/,
    );
    refused(
      tamper((r) => (r.transactions[0]!.contractAddress = SAFE_FACTORY_V150)),
      /does not follow from sender and nonce/,
    );
    refused({ chain: 31337, transactions: [] }, /no transactions/);
  });

  it("on Base Sepolia, accepts only the canonical Safe factory", () => {
    const r = load("CreateSafes");
    r.chain = 84532;
    for (const t of r.transactions) t.transaction.chainId = "0x14a34";
    refused(r, /not the Safe factory/);
  });
});

describe("before each signature", () => {
  const run = parseRun(load("DeployARL"));
  const step = run.steps[0]!;
  const ok = { account: run.from, chainId: 31337, nonce: step.nonce };

  it("needs the planned wallet, chain and nonce", () => {
    assert.equal(checkBeforeSend(step, ok, run.chainId), undefined);
    assert.match(checkBeforeSend(step, { ...ok, chainId: 84532 }, run.chainId) ?? "", /switch/);
    assert.match(
      checkBeforeSend(step, { ...ok, account: SAFE_FACTORY_V150 }, run.chainId) ?? "",
      /prepared for that address/,
    );
    assert.match(
      checkBeforeSend(step, { ...ok, nonce: step.nonce + 1 }, run.chainId) ?? "",
      /prepared again/,
    );
  });
});
