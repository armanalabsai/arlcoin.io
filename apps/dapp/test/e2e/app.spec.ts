// End to end on a local Anvil chain: the real contracts, the production build, and the
// "Local dev account" wallet (Anvil development account 1, unlocked by the node; no key in the
// browser). The fixture gives that account 5,000,000 ARL and makes it the vesting beneficiary.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { E2E_RPC } from "./chain";

const OTHER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(E2E_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return ((await res.json()) as { result?: unknown }).result;
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
  for (const path of ["/", "/staking", "/vesting", "/payments"]) {
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
