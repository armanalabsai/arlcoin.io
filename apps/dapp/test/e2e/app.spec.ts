// End to end on a local Anvil chain: the real contracts, the production build, and the
// "Local dev account" wallet (Anvil development account 1, unlocked by the node; no key in the
// browser). The fixture gives that account 5,000,000 ARL and makes it the vesting beneficiary.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import deployedContracts from "../../contracts/deployedContracts";
import { CRS_DIR, E2E_RPC } from "./chain";

const OTHER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
// Anvil development accounts 5 and 4: a second provider's payee, and the facilitator.
const PROVIDER = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";
const FACILITATOR = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(E2E_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return ((await res.json()) as { result?: unknown }).result;
}

/** ARL balance of `account`, read from the chain. */
async function arlBalance(account: string): Promise<bigint> {
  const data = `0x70a08231${account.slice(2).toLowerCase().padStart(64, "0")}`;
  const to = deployedContracts[31337].ARLToken.address;
  return BigInt((await rpc("eth_call", [{ to, data }, "latest"])) as string);
}

/** Reads a displayed ARL amount ("1,234.5 ARL") as a number. */
async function amount(page: Page, testId: string): Promise<number> {
  const text = (await page.getByTestId(testId).textContent()) ?? "";
  return Number(text.replace(/ARL|,/g, "").trim());
}

async function connect(page: Page, path = "/") {
  await page.goto(path);
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  await page.getByRole("button", { name: /Local dev account/ }).click();
  await expect(page.getByTestId("account")).toContainText("0x7099");
}

test.describe.configure({ mode: "serial" });

test("asks for a wallet before showing anything", async ({ page }) => {
  await page.goto("/staking");
  await expect(page.getByText("Connect a wallet to continue.")).toBeVisible();
  await expect(page.getByText("Local test chain only.")).toBeVisible();
});

test("phone width: no sideways scroll, bottom navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/staking", "/vesting", "/payments", "/network", "/jobs", "/private"]) {
    await connect(page, path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await expect(page.getByRole("navigation", { name: "Main (mobile)" })).toBeVisible();
  await page.screenshot({ path: "test-results/phone-vesting.png", fullPage: true });
});

test("wallet: shows the balance and sends ARL", async ({ page }) => {
  await connect(page);
  await expect(page.getByTestId("wallet-balance")).toContainText("5,000,000");
  await page.getByTestId("send-to").fill("not an address");
  await expect(page.getByText("Not a valid address")).toBeVisible();
  await page.getByTestId("send-to").fill(OTHER);
  await page.getByTestId("send-input").fill("1,000");
  await page.getByTestId("send-submit").click();
  await expect(page.getByTestId("wallet-balance")).toContainText("4,999,000");
  await page.screenshot({ path: "test-results/wallet.png", fullPage: true });
});

test("staking: stake, earn, claim, withdraw, exit", async ({ page }) => {
  await connect(page, "/staking");
  await expect(page.getByTestId("stake-input")).toBeVisible();

  await page.getByTestId("stake-input").fill("9999999");
  await expect(page.getByText("More than available")).toBeVisible();
  await expect(page.getByTestId("stake-submit")).toBeDisabled();

  await page.getByTestId("stake-input").fill("1000");
  await page.getByTestId("stake-submit").click();
  await expect(page.getByTestId("staking-staked")).toContainText("1,000");

  // One block per second: rewards accrue on screen (about 0.0116 ARL per second here).
  await expect
    .poll(() => amount(page, "staking-earned"), { timeout: 20_000 })
    .toBeGreaterThan(0.05);
  await page.screenshot({ path: "test-results/staking.png", fullPage: true });

  // Claiming pays out and resets the counter, which then grows again from zero.
  await page.getByTestId("staking-claim").click();
  await expect.poll(() => amount(page, "staking-earned")).toBeLessThan(0.04);

  await page.getByTestId("withdraw-input").fill("400");
  await page.getByTestId("withdraw-submit").click();
  await expect(page.getByTestId("staking-staked")).toContainText("600");

  await page.getByTestId("staking-exit").click();
  await expect(page.getByTestId("staking-staked")).toHaveText(/^0\s*ARL$/);
});

test("payments: limit, signed ceiling, metered charge, cap, cancel", async ({ page }) => {
  await connect(page, "/payments");

  await page.getByTestId("limit-input").fill("100");
  await page.getByTestId("limit-submit").click();
  await expect(page.getByTestId("permit2-allowance")).toContainText("100");

  // 3,700 units at 0.001 ARL: 3.7 ARL of a 5 ARL ceiling.
  await page.getByTestId("ceiling-input").fill("5");
  await page.getByTestId("ceiling-submit").click();
  await expect(page.getByTestId("authorization")).toBeVisible();
  await page.getByTestId("units-input").fill("3700");
  await expect(page.getByTestId("metered")).toHaveText("Charge: 3.7 ARL");
  await page.getByTestId("settle").click();
  await expect(page.getByTestId("outcome")).toContainText("Paid 3.7 ARL of the 5 ARL ceiling");
  await expect(page.getByTestId("service-balance")).toContainText("3.7");
  // Permit2 moved exactly the charge: the limit went down by 3.7.
  await expect(page.getByTestId("permit2-allowance")).toContainText("96.3");
  await page.screenshot({ path: "test-results/payments.png", fullPage: true });

  // Usage above the ceiling is charged at the ceiling, never more.
  await page.getByTestId("ceiling-input").fill("2");
  await page.getByTestId("ceiling-submit").click();
  await page.getByTestId("units-input").fill("10000");
  await expect(page.getByTestId("metered")).toHaveText("Charge: 2 ARL (capped at the ceiling)");
  await page.getByTestId("settle").click();
  await expect(page.getByTestId("outcome")).toContainText("Paid 2 ARL of the 2 ARL ceiling");
  await expect(page.getByTestId("service-balance")).toContainText("5.7");

  // No usage: nothing is sent.
  await page.getByTestId("ceiling-input").fill("1");
  await page.getByTestId("ceiling-submit").click();
  await page.getByTestId("units-input").fill("0");
  await page.getByTestId("settle").click();
  await expect(page.getByTestId("outcome")).toContainText("Nothing to pay");
  await expect(page.getByTestId("service-balance")).toContainText("5.7");

  // The payer cancels before the service charges.
  await page.getByTestId("ceiling-input").fill("1");
  await page.getByTestId("ceiling-submit").click();
  await page.getByTestId("cancel").click();
  await expect(page.getByTestId("outcome")).toContainText("Cancelled");

  await page.getByTestId("limit-revoke").click();
  await expect(page.getByTestId("permit2-allowance")).toHaveText(/^0\s*ARL$/);
});

test("network: register a service, pay it through its own terms, take it offline", async ({
  page,
}) => {
  await connect(page, "/network");
  const list = page.getByTestId("service-list");
  await expect(list).toContainText("Demo AI service");
  await expect(list).toContainText("0.001 ARL per 1,000 tokens");

  // Unsafe links are refused before anything is sent.
  await page.getByTestId("svc-name").fill("Vision model");
  await page.getByTestId("svc-endpoint").fill("javascript:alert(1)");
  await page.getByTestId("svc-price").fill("0.002");
  await page.getByTestId("svc-unit").fill("image");
  await page.getByTestId("svc-submit").click();
  await expect(page.getByTestId("svc-error")).toContainText("endpoint");

  await page.getByTestId("svc-endpoint").fill("https://vision.example.org/v1");
  await page.getByLabel("Paid to (default: your wallet)").fill(PROVIDER);
  await page.getByLabel("Settled by (default: your wallet)").fill(FACILITATOR);
  await page.getByTestId("svc-submit").click();
  await expect(page.getByTestId("service-1")).toContainText("Vision model");
  await expect(page.getByTestId("service-1")).toContainText("0.002 ARL per image");
  await page.screenshot({ path: "test-results/network.png", fullPage: true });

  // Paying it uses its price, payee and facilitator from the registry.
  await page.getByTestId("pay-1").click();
  await expect(page).toHaveURL(/\/payments\?service=1$/);
  await expect(page.getByTestId("service-select")).toHaveValue("1");
  await page.getByTestId("limit-input").fill("10");
  await page.getByTestId("limit-submit").click();
  await expect(page.getByTestId("permit2-allowance")).toContainText("10");
  await page.getByTestId("ceiling-input").fill("1");
  await page.getByTestId("ceiling-submit").click();
  await page.getByTestId("units-input").fill("100");
  await expect(page.getByTestId("metered")).toHaveText("Charge: 0.2 ARL");
  await page.getByTestId("settle").click();
  await expect(page.getByTestId("outcome")).toContainText("Paid 0.2 ARL of the 1 ARL ceiling");
  await expect(page.getByTestId("service-balance")).toContainText("0.2");

  // The provider (the wallet that registered it) takes it offline. A full page load drops the
  // local development wallet, so connect again.
  await connect(page, "/network");
  await page.getByTestId("deactivate-1").click();
  await expect(page.getByTestId("service-1")).toHaveCount(0);
  await expect(page.getByTestId("service-list")).toContainText("Demo AI service");
});

test("private: identity, join, anonymous vote proven in the browser, one vote per member", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // Serve bb.js's proving parameters from the local cache (see chain.ts).
  await page.route(
    /crs\.aztec-(cdn\.foundation|labs\.com)\/(g1_compressed|g2|grumpkin_g1_v2)\.dat$/,
    async (route) => {
      const file = /[a-z0-9_]+\.dat$/.exec(route.request().url())![0];
      const body = readFileSync(join(CRS_DIR, file));
      const range = /bytes=0-(\d+)/.exec(route.request().headers().range ?? "");
      const end = range ? Math.min(Number(range[1]) + 1, body.length) : body.length;
      await route.fulfill({ status: range ? 206 : 200, body: body.subarray(0, end) });
    },
  );
  await connect(page, "/private");
  await expect(page.getByTestId("zk-members")).toHaveText("3");

  await page.getByTestId("zk-identity").click();
  await expect(page.getByTestId("zk-member")).toHaveText("Not a member yet");
  await page.getByTestId("zk-join").click();
  await expect(page.getByTestId("zk-member")).toHaveText("Member");
  await expect(page.getByTestId("zk-members")).toHaveText("4");

  await page.getByTestId("zk-vote-0").click();
  await expect(page.getByTestId("zk-status")).toContainText(
    "Nothing on-chain links it to your wallet",
    {
      timeout: 120_000,
    },
  );
  await expect(page.getByTestId("zk-count-0")).toHaveText("1");
  await page.screenshot({ path: "test-results/private.png", fullPage: true });

  // A second vote from the same identity, even for another option, is refused.
  await page.getByTestId("zk-vote-1").click();
  await expect(page.getByTestId("zk-status")).toContainText("already voted", { timeout: 60_000 });
  await expect(page.getByTestId("zk-count-1")).toHaveText("0");
});

test("vesting: nothing before the cliff, then a release to the beneficiary", async ({ page }) => {
  await connect(page, "/vesting");
  await expect(page.getByTestId("vesting-beneficiary")).toHaveText(
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  );
  await expect(page.getByTestId("vesting-phase")).toHaveText("In cliff");
  await expect(page.getByTestId("vesting-total")).toContainText("1,500,000");
  await expect(page.getByTestId("vesting-release")).toBeDisabled();

  // Ten days later: past the 5 minute cliff, a third of the 30 day schedule.
  await rpc("evm_increaseTime", [10 * 86_400]);
  await rpc("evm_mine");
  await expect(page.getByTestId("vesting-phase")).toHaveText("Vesting");
  await expect
    .poll(() => amount(page, "vesting-releasable"), { timeout: 15_000 })
    .toBeGreaterThan(400_000);

  await page.getByTestId("vesting-release").click();
  await expect
    .poll(() => amount(page, "vesting-released"), { timeout: 15_000 })
    .toBeGreaterThan(400_000);
  // Held plus released is read at one block: the total never double-counts a release.
  await expect(page.getByTestId("vesting-total")).toContainText("1,500,000");
  await page.screenshot({ path: "test-results/vesting.png", fullPage: true });
});

test("jobs: post, fund, deliver, accept and pay; reject and refund; refund after the deadline", async ({
  page,
}) => {
  // The demo service registered on the Network screen is Anvil account 3; the screen can play it
  // as the provider because the local node unlocks it. The client (account 1) is the evaluator.
  const SERVICE = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
  const CLIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const ESCROW = deployedContracts[31337].ARLJobs.address;
  await connect(page, "/jobs");
  await expect(page.getByTestId("jobs-empty")).toBeVisible();

  const post = async (description: string, budget: string) => {
    await page.getByTestId("job-provider").selectOption(SERVICE);
    await page.getByTestId("job-description").fill(description);
    await page.getByTestId("job-budget").fill(budget);
    await page.getByTestId("job-hours").fill("24");
    await page.getByTestId("job-post").click();
  };

  // Invalid input is refused before any transaction.
  await page.getByTestId("job-description").fill("Summarise ten reports");
  await page.getByTestId("job-budget").fill("0");
  await page.getByTestId("job-post").click();
  await expect(page.getByTestId("job-error")).toHaveText("Amount must be above zero");
  await page.getByTestId("job-budget").fill("1");
  await page.getByTestId("job-post").click();
  await expect(page.getByTestId("job-error")).toHaveText(
    "Choose a service or enter a provider address",
  );
  await expect(page.getByTestId("jobs-empty")).toBeVisible();

  // Job 1: accepted, the provider is paid the budget.
  await post("Summarise ten reports", "250");
  await expect(page.getByTestId("jobs-status")).toHaveText(
    "Job 1 posted. Fund it to start the work.",
  );
  await expect(page.getByTestId("job-1-status")).toHaveText("Open");
  const clientBefore = await arlBalance(CLIENT);
  const serviceBefore = await arlBalance(SERVICE);
  await page.getByTestId("job-1-fund").click();
  await expect(page.getByTestId("job-1-status")).toHaveText("Funded");
  expect(await arlBalance(ESCROW)).toBe(250n * 10n ** 18n);
  expect(await arlBalance(CLIENT)).toBe(clientBefore - 250n * 10n ** 18n);

  await page.getByTestId("job-1-result").fill("https://example.com/summary.pdf");
  await page.getByTestId("job-1-submit").click();
  await expect(page.getByTestId("job-1-status")).toHaveText("Submitted");
  await expect(page.getByText("Result reference")).toBeVisible();

  await page.getByTestId("job-1-complete").click();
  await expect(page.getByTestId("job-1-status")).toHaveText("Completed");
  expect(await arlBalance(SERVICE)).toBe(serviceBefore + 250n * 10n ** 18n);
  expect(await arlBalance(ESCROW)).toBe(0n);

  // Job 2: the evaluator rejects the funded job, the client gets the budget back.
  await post("Translate a contract", "40");
  await expect(page.getByTestId("job-2-status")).toHaveText("Open");
  await page.getByTestId("job-2-fund").click();
  await expect(page.getByTestId("job-2-status")).toHaveText("Funded");
  const beforeReject = await arlBalance(CLIENT);
  await page.getByTestId("job-2-reject-evaluator").click();
  await expect(page.getByTestId("job-2-status")).toHaveText("Rejected");
  expect(await arlBalance(CLIENT)).toBe(beforeReject + 40n * 10n ** 18n);

  // Job 3: nobody delivers before the deadline; anyone can return the budget to the client.
  await post("Label 500 images", "15");
  await expect(page.getByTestId("job-3-status")).toHaveText("Open");
  await page.getByTestId("job-3-fund").click();
  await expect(page.getByTestId("job-3-status")).toHaveText("Funded");
  await expect(page.getByTestId("job-3-refund")).toHaveCount(0);
  await rpc("evm_increaseTime", [25 * 3600]);
  await rpc("evm_mine");
  const beforeRefund = await arlBalance(CLIENT);
  await page.getByTestId("job-3-refund").click();
  await expect(page.getByTestId("job-3-status")).toHaveText("Expired");
  expect(await arlBalance(CLIENT)).toBe(beforeRefund + 15n * 10n ** 18n);
  expect(await arlBalance(ESCROW)).toBe(0n);
  await page.screenshot({ path: "test-results/jobs.png", fullPage: true });
});
