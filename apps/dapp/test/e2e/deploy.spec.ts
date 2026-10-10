// Deploy screen end to end: a real Foundry dry run of DeployARL, prepared for Anvil development
// account 9, signed transaction by transaction through an EIP-1193 wallet. The test wallet
// forwards to the local node, which holds the account unlocked: no key exists in the browser.
import { expect, test } from "@playwright/test";

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { E2E_RPC } from "./chain";

const DEPLOYER = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720";
const contracts = join(import.meta.dirname, "..", "..", "..", "..", "contracts");

test.describe.configure({ mode: "serial" });

/** Prepares the deployment the way the owner would: a dry run, nothing broadcast. */
function dryRun(): string {
  // The plan is built from the committed local config by the planner, as on a real deployment.
  execFileSync(
    "node",
    [
      join(contracts, "..", "packages", "deploy", "src", "cli.ts"),
      join(contracts, "deploy", "config", "local.json"),
      join(contracts, "deploy", "deployments", "e2e-plan.json"),
    ],
    { stdio: "pipe" },
  );
  execFileSync(
    "forge",
    ["script", "script/DeployARL.s.sol:DeployARL", "--rpc-url", E2E_RPC, "--sender", DEPLOYER],
    {
      cwd: contracts,
      env: {
        ...process.env,
        ARL_PLAN: "deploy/deployments/e2e-plan.json",
      },
      stdio: "pipe",
    },
  );
  return join(contracts, "broadcast", "DeployARL.s.sol", "31337", "dry-run", "run-latest.json");
}

test("deploy: explains and signs a prepared deployment, refuses a tampered file", async ({
  page,
}, testInfo) => {
  const file = dryRun();

  // A wallet that asks for nothing secret: it forwards requests to the local node.
  await page.addInitScript(
    ({ rpc, account }) => {
      let id = 0;
      (window as unknown as { ethereum: unknown }).ethereum = {
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
          const res = await fetch(rpc, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params ?? [] }),
          });
          const body = (await res.json()) as { result?: unknown; error?: { message: string } };
          if (body.error) throw new Error(body.error.message);
          return body.result;
        },
        on: () => undefined,
        removeListener: () => undefined,
      };
    },
    { rpc: E2E_RPC, account: DEPLOYER },
  );

  await page.goto("/deploy");
  await expect(page.getByTestId("deploy-safety")).toContainText("Never type a seed phrase");

  // A file whose token code was changed is refused before anything can be signed.
  const tampered = JSON.parse(readFileSync(file, "utf8")) as {
    transactions: { transaction: { input: string } }[];
  };
  const tx = tampered.transactions[3]!.transaction;
  tx.input = `${tx.input.slice(0, 100)}ff${tx.input.slice(102)}`;
  const bad = testInfo.outputPath("tampered.json");
  writeFileSync(bad, JSON.stringify(tampered));
  await page.getByTestId("deploy-file").setInputFiles(bad);
  await expect(page.getByTestId("deploy-error")).toContainText(
    "ARLToken code is not the ARL build",
  );
  await expect(page.getByTestId("deploy-steps")).toHaveCount(0);

  await page.getByTestId("deploy-file").setInputFiles(file);
  await expect(page.getByTestId("deploy-steps").locator("li")).toHaveCount(4);
  await expect(page.getByTestId("deploy-step-1")).toContainText("Create a vesting wallet");
  await expect(page.getByTestId("deploy-step-3")).toContainText("delay of 48 hours");
  await expect(page.getByTestId("deploy-step-4")).toContainText(
    "Nothing is minted to your address",
  );

  await page.getByTestId("deploy-connect").click();
  await expect(page.getByTestId("deploy-account")).toHaveText(DEPLOYER);
  for (const n of [1, 2, 3, 4]) {
    await page.getByTestId("deploy-sign").click();
    await expect(page.getByTestId(`deploy-status-${String(n)}`)).toHaveText("Done");
  }
  await expect(page.getByTestId("deploy-done")).toBeVisible();
  // Nothing counts as deployed until the verified record is written from the signed run file.
  await expect(page.getByTestId("deploy-record-command")).toContainText(
    "packages/deploy/src/record-cli.ts arl",
  );
  await page.screenshot({ path: "test-results/deploy.png", fullPage: true });

  // The phone-signed dry run becomes a record only through the verification tool, which checks
  // every created contract on chain (local Anvil: rehearsal mode).
  const record = testInfo.outputPath("31337.json");
  execFileSync(
    "node",
    [
      join(contracts, "..", "packages", "deploy", "src", "record-cli.ts"),
      "arl",
      file,
      E2E_RPC,
      record,
      "--local-anvil",
    ],
    { stdio: "pipe" },
  );
  const written = JSON.parse(readFileSync(record, "utf8")) as {
    deployer: string;
    verified: { kind: string; network: string };
  };
  expect(written.deployer.toLowerCase()).toBe(DEPLOYER.toLowerCase());
  expect(written.verified).toMatchObject({ kind: "arl", network: "local-anvil-rehearsal" });

  // The owner signs from a phone: no sideways scroll at 360 px with every step shown.
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/deploy-phone.png", fullPage: true });

  // Signing the same file again is refused: the wallet's nonce has moved on.
  await page.reload();
  await page.getByTestId("deploy-file").setInputFiles(file);
  await page.getByTestId("deploy-connect").click();
  await page.getByTestId("deploy-sign").click();
  await expect(page.getByTestId("deploy-message")).toContainText("prepared again");
});
