import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { SupplyError, computeSupply, formatReport } from "../src/circulating.ts";
import {
  ManifestError,
  buildManifest,
  type DeploymentManifest,
  type DeploymentRecord,
} from "../src/manifest.ts";
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
const manifest = buildManifest(plan, deployment);

const ARL = 10n ** 18n;
const role = (name: string) => {
  const h = manifest.holders.find((x) => x.role === name);
  assert.ok(h, name);
  return h.address.toLowerCase();
};

/** Genesis balances exactly as the token constructor mints them. */
function genesis(): Map<string, bigint> {
  const b = new Map<string, bigint>();
  const a = plan.allocations;
  const set = (name: string, amount: string | undefined) => {
    assert.ok(amount);
    b.set(role(name), BigInt(amount));
  };
  set("publicLaunch", a.publicLaunch);
  set("communityStaking", a.communityStaking);
  set("ecosystemGrowth", a.ecosystemGrowth);
  set("liquidity", a.liquidity);
  set("teamPool", a.team);
  set("earlyUsers", a.earlyUsers);
  set("grantsBugBounty", a.grantsBugBounty);
  set("investorsVesting", a.investors);
  set("partnershipsVesting", a.strategicPartnerships);
  set("treasuryTimelock", a.treasury);
  set("founder", a.founder);
  return b;
}

const supply = (balances: Map<string, bigint>) =>
  computeSupply(manifest, 21_000_000n * ARL, (addr) => balances.get(addr.toLowerCase()) ?? 0n);

const move = (b: Map<string, bigint>, from: string, to: string, amount: bigint) => {
  b.set(from, (b.get(from) ?? 0n) - amount);
  b.set(to, (b.get(to) ?? 0n) + amount);
};
const outsider = "0x000000000000000000000000000000000000beef";

describe("deployment manifest", () => {
  it("lists every genesis and protocol-controlled address once", () => {
    assert.equal(manifest.holders.length, 13);
    assert.equal(new Set(manifest.holders.map((h) => h.address.toLowerCase())).size, 13);
    assert.equal(manifest.chainId, 31337);
    assert.equal(manifest.token, deployment.token);
  });

  it("only the Founder Safe is circulating", () => {
    assert.deepEqual(
      manifest.holders.filter((h) => h.circulating).map((h) => h.role),
      ["founder"],
    );
  });

  it("rejects a deployment record from another chain or with a malformed address", () => {
    assert.throws(() => buildManifest(plan, { ...deployment, chainId: 1 }), ManifestError);
    assert.throws(() => buildManifest(plan, { ...deployment, token: "0x1234" }), ManifestError);
  });

  it("lists a claim distributor as protocol-controlled", () => {
    const distributor = "0x000000000000000000000000000000000000d157";
    const m = buildManifest(plan, deployment, [{ chainId: 31337, distributor }]);
    const h = m.holders.find((x) => x.address === distributor);
    assert.ok(h);
    assert.equal(h.circulating, false);
    assert.throws(
      () => buildManifest(plan, deployment, [{ chainId: 1, distributor }]),
      ManifestError,
    );
    assert.throws(
      () => buildManifest(plan, deployment, [{ chainId: 31337, distributor: deployment.timelock }]),
      /same address/,
    );
  });

  it("rejects an address used for two roles", () => {
    const reused = { ...deployment, timelock: deployment.investorsVesting };
    assert.throws(
      () => buildManifest(plan, reused),
      (e: unknown) => e instanceof ManifestError && /same address/.test(e.message),
    );
  });
});

describe("circulating supply", () => {
  it("at TGE is exactly the Founder's unlocked 2,100,000 ARL (spec section 6)", () => {
    const report = supply(genesis());
    assert.equal(report.totalSupply, 21_000_000n * ARL);
    assert.equal(report.circulatingSupply, 2_100_000n * ARL);
    assert.equal(report.lockedSupply, 18_900_000n * ARL);
  });

  it("does not change when the Founder transfers or sells unlocked tokens", () => {
    const b = genesis();
    move(b, role("founder"), outsider, 500_000n * ARL);
    assert.equal(supply(b).circulatingSupply, 2_100_000n * ARL);
  });

  it("rises only when tokens leave a protocol-controlled or locked address", () => {
    const b = genesis();
    move(b, role("liquidity"), outsider, 1n);
    assert.equal(supply(b).circulatingSupply, 2_100_000n * ARL + 1n);
  });

  it("counts vested tokens only once released out of the vesting wallet", () => {
    const b = genesis();
    const investorsSafe = plan.vesting.investors.beneficiary.toLowerCase();
    move(b, role("investorsVesting"), investorsSafe, 12_345n * ARL);
    assert.equal(supply(b).circulatingSupply, 2_112_345n * ARL);
  });

  it("does not count treasury tokens moved to a protocol-controlled Safe", () => {
    const b = genesis();
    move(b, role("treasuryTimelock"), role("treasurySafe"), 1_000n * ARL);
    assert.equal(supply(b).circulatingSupply, 2_100_000n * ARL);
  });

  it("formats exact base-unit and ARL strings", () => {
    const f = formatReport(supply(genesis()));
    assert.equal(f.circulatingSupply, "2100000000000000000000000");
    assert.equal(f.circulatingSupplyArl, "2100000");
    assert.equal(f.totalSupplyArl, "21000000");
  });

  it("fails closed on a wrong total supply or manifest schema", () => {
    assert.throws(() => computeSupply(manifest, 1n, () => 0n), SupplyError);
    const other = { ...manifest, schema: "other" } as unknown as DeploymentManifest;
    assert.throws(() => computeSupply(other, 21_000_000n * ARL, () => 0n), SupplyError);
  });
});
