import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

import {
  getSafeL2SingletonDeployment,
  getSafeSingletonDeployment,
} from "@safe-global/safe-deployments";

// The Solidity plan validator pins the canonical Safe v1.5.0 singletons, their code hashes and
// the proxy runtime code. These tests fail if those values differ from the official Safe
// packages, so the on-chain checks can never drift from upstream.

const read = (path: string) =>
  readFileSync(new URL(`../../../contracts/${path}`, import.meta.url), "utf8");
const planSource = read("script/ARLDeployPlan.sol");
const deployTestSource = read("test/deploy/ARLDeploy.t.sol");

function constant(name: string): string {
  const match = new RegExp(`constant ${name} =\\s*(0x[0-9a-fA-F]+);`).exec(planSource);
  assert.ok(match?.[1], `constant ${name} not found in ARLDeployPlan.sol`);
  return match[1];
}

const safe = getSafeSingletonDeployment({ version: "1.5.0" });
const safeL2 = getSafeL2SingletonDeployment({ version: "1.5.0" });

describe("ARLDeployPlan.sol Safe v1.5.0 constants", () => {
  it("match the canonical singletons in safe-deployments", () => {
    assert.ok(safe?.deployments.canonical && safeL2?.deployments.canonical);
    assert.equal(constant("SAFE_SINGLETON_V150"), safe.deployments.canonical.address);
    assert.equal(constant("SAFE_L2_SINGLETON_V150"), safeL2.deployments.canonical.address);
    assert.equal(constant("SAFE_SINGLETON_V150_CODEHASH"), safe.deployments.canonical.codeHash);
    assert.equal(
      constant("SAFE_L2_SINGLETON_V150_CODEHASH"),
      safeL2.deployments.canonical.codeHash,
    );
  });

  it("the test proxy runtime is the official SafeProxy v1.5.0 build", () => {
    const require = createRequire(import.meta.url);
    const artifact =
      require("@safe-global/safe-smart-account/build/artifacts/contracts/proxies/SafeProxy.sol/SafeProxy.json") as {
        deployedBytecode: string;
      };
    const match = /SAFE_PROXY_RUNTIME =\s*hex"([0-9a-f]+)"/.exec(deployTestSource);
    assert.ok(match?.[1], "SAFE_PROXY_RUNTIME not found in ARLDeploy.t.sol");
    assert.equal(`0x${match[1]}`, artifact.deployedBytecode.toLowerCase());
  });
});
