import { test } from "@playwright/test";

// Visual QA captures, not assertions. Run with SHOTS=1.
test.skip(!process.env.SHOTS, "screenshots only on request");

const dir = process.env.SHOTS_DIR ?? "test-results/shots";

test("capture", async ({ page }, info) => {
  const p = info.project.name;
  await page.goto("/core");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/${p}-home.png` });
  await page.goto("/core/token");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/${p}-token.png` });
  await page.goto("/core/team");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/${p}-team.png` });
  await page.goto("/core/technology");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/${p}-technology.png` });
  await page
    .getByRole("link", { name: /AI Payments/ })
    .first()
    .click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${dir}/${p}-detail.png` });
  await page.goto("/core/token/allocation");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${dir}/${p}-allocation.png` });
  await page.goto("/core");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/${p}-index.png` });
});
