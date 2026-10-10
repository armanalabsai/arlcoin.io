// The app as arlcoin.io serves it under /app (scripts/build-site.sh, playwright.hosted.config.ts).
// Before the Base Mainnet launch the public build must offer nothing to claim or trade, and the
// deploy screen must work from /app.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Fails the test on any request under /app that the static host does not serve. Two misses are
 * expected: the claim list before the launch, and Next.js's segment prefetches
 * (`__next.<segment>.__PAGE__.txt`), which a static export writes under another name; the
 * website has the same, and a missed prefetch only means a full page load on navigation.
 */
function watchMissing(page: Page): string[] {
  const missing: string[] = [];
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    const expected = path.startsWith("/app/claims/") || /\/__next\.[^/]+\.txt$/.test(path);
    if (path.startsWith("/app/") && r.status() >= 400 && !expected) {
      missing.push(`${String(r.status())} ${path}`);
    }
  });
  return missing;
}

test("the website and the app are served together", async ({ page }) => {
  const missing = watchMissing(page);
  const site = await page.goto("/");
  expect(site?.status()).toBe(200);
  const app = await page.goto("/app/");
  expect(app?.status()).toBe(200);
  await expect(page.getByRole("button", { name: "Connect wallet" }).first()).toBeVisible();
  expect(missing).toEqual([]);
});

test("trade is closed before the launch", async ({ page }, testInfo) => {
  const missing = watchMissing(page);
  await page.goto("/app/trade/");
  await expect(page.getByTestId("trade-closed")).toContainText(
    "Trading opens with the Base Mainnet launch on 2026-11-01",
  );
  await expect(page.getByTestId("trade-submit")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("trade.png"), fullPage: true });
  expect(missing).toEqual([]);
});

test("claim is closed before the launch: no Base Mainnet claim list is published", async ({
  page,
  request,
}, testInfo) => {
  const missing = watchMissing(page);
  expect((await request.get("/app/claims/8453.json")).status()).toBe(404);
  await page.goto("/app/claim/");
  await expect(page.getByRole("heading", { name: "Claim" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Claim/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("claim.png"), fullPage: true });
  expect(missing).toEqual([]);
});

test("the deploy screen works from /app", async ({ page }, testInfo) => {
  const missing = watchMissing(page);
  await page.goto("/app/deploy/");
  await expect(page.getByTestId("deploy-safety")).toContainText("Never type a seed phrase");
  await page.getByTestId("deploy-file").setInputFiles({
    name: "run-latest.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"transactions":[]}'),
  });
  await expect(page.getByTestId("deploy-error")).toBeVisible();
  await expect(page.getByTestId("deploy-steps")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("deploy.png"), fullPage: true });
  expect(missing).toEqual([]);
});
