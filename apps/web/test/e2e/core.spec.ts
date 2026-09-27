import { expect, test, type Page } from "@playwright/test";

import { allPaths } from "../../src/content/registry.ts";

// Behaviour of the Interactive Core against the production build.

/** Collects console errors and uncaught exceptions (including hydration errors). */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** Marks the document; the mark survives only if no full page load happens. */
async function mark(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __arlMark: number }).__arlMark = 1;
  });
}

async function expectSameDocument(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __arlMark?: number }).__arlMark)).toBe(
    1,
  );
}

const core = (page: Page) => page.getByTestId("arl-core");
const surface = (page: Page) => page.getByTestId("detail-surface");

test("overview renders the Core and every layer without errors", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(core(page)).toBeVisible();
  const layers = page.getByRole("list", { name: "Layers" }).getByRole("link");
  await expect(layers).toHaveCount(6);
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test("the Core cycles through the layers in place", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await mark(page);
  await core(page).click();
  await expect(page).toHaveURL(/\/core\/team$/);
  await expect(page.getByRole("link", { name: /Joon-Ho Park/ }).first()).toBeVisible();
  await core(page).click();
  await expect(page).toHaveURL(/\/core\/token$/);
  await expect(page).toHaveTitle("Token · ARL");
  await expectSameDocument(page);
  expect(errors).toEqual([]);
});

test("a card opens its detail surface in place and closes back to the layer", async ({ page }) => {
  await page.goto("/core/token");
  await mark(page);
  const card = page.locator('[data-ring-card="max-supply"]');
  await card.click();
  await expect(page).toHaveURL(/\/core\/token\/max-supply$/);
  await expect(surface(page)).toBeVisible();
  await expect(surface(page).getByRole("heading", { name: "Maximum Supply" })).toBeVisible();
  await expect(surface(page)).toContainText("21,000,000");
  await expectSameDocument(page);

  await page.keyboard.press("Escape");
  await expect(surface(page)).toBeHidden();
  await expect(page).toHaveURL(/\/core\/token$/);
  await expect(card).toBeFocused();
  await expectSameDocument(page);
});

test("browser back and forward move between layer and detail", async ({ page }) => {
  await page.goto("/core/technology");
  await page.locator('[data-ring-card="ai-payments"]').click();
  await expect(surface(page)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/core\/technology$/);
  await expect(surface(page)).toBeHidden();
  await page.goForward();
  await expect(page).toHaveURL(/\/core\/technology\/ai-payments$/);
  await expect(surface(page)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/core\/technology$/);
  await expect(surface(page)).toBeHidden();
});

test("deep links render the detail and survive a refresh", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/core/token/circulating-supply");
  await expect(surface(page)).toBeVisible();
  await expect(surface(page)).toContainText("Not yet deployed");
  await page.reload();
  await expect(surface(page)).toBeVisible();
  await expect(page).toHaveTitle("Circulating Supply · Token · ARL");
  await page.getByRole("button", { name: "Back to Token" }).click();
  await expect(page).toHaveURL(/\/core\/token$/);
  await expect(surface(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test("detail content is in the server-rendered HTML", async ({ request }) => {
  const html = await (await request.get("/core/token/max-supply")).text();
  expect(html).toContain("<title>Maximum Supply · Token · ARL</title>");
  expect(html).toContain('role="dialog"');
  expect(html).toContain("21,000,000");
  expect(html).toMatch(/rel="canonical" href="https:\/\/arlcoin\.io\/core\/token\/max-supply"/);
  expect(html).toMatch(/property="og:title" content="Maximum Supply · Token · ARL"/);
});

test("sitemap lists every route and robots points to it", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap.match(/<loc>/g)).toHaveLength(allPaths().length);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap: https://arlcoin.io/sitemap.xml");
  expect((await request.get("/core/unknown")).status()).toBe(404);
});

test("keyboard: Enter on the Core, Space on a card, arrows between cards", async ({ page }) => {
  await page.goto("/");
  await core(page).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/core\/team$/);
  const first = page.locator('[data-ring-card="foundark"]');
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-ring-card="joon-ho-park"]')).toBeFocused();
  await page.keyboard.press(" ");
  await expect(page).toHaveURL(/\/core\/team\/joon-ho-park$/);
  await expect(surface(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-ring-card="joon-ho-park"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);
});

test("the detail surface traps focus while open", async ({ page }) => {
  await page.goto("/core/security/audit");
  await expect(surface(page)).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[data-testid="detail-surface"]')),
    );
    expect(inside).toBe(true);
  }
});

test("reduced motion still opens and closes the detail", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/core/roadmap");
  await page.locator('[data-ring-card="phase-2"]').click();
  await expect(surface(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(surface(page)).toBeHidden();
});

test("the index opens cards without a page load", async ({ page }) => {
  await page.goto("/");
  await mark(page);
  await page.getByRole("contentinfo").getByRole("link", { name: "External Audit" }).click();
  await expect(page).toHaveURL(/\/core\/security\/audit$/);
  await expect(surface(page)).toBeVisible();
  await expectSameDocument(page);
});

test("no horizontal overflow on any layer", async ({ page }) => {
  for (const path of [
    "/",
    "/core/team",
    "/core/token",
    "/core/technology",
    "/core/security",
    "/core/roadmap",
    "/core/ecosystem",
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("deployment-dependent token values are never given a number", async ({ page }) => {
  for (const id of ["circulating-supply", "contract-address", "staked"]) {
    await page.goto(`/core/token/${id}`);
    await expect(surface(page)).toContainText("Not yet deployed");
  }
});

test("team layer: 12 profiles around the Core, unverified details withheld", async ({ page }) => {
  await page.goto("/");
  await core(page).click();
  await expect(page).toHaveURL(/\/core\/team$/);
  await expect(core(page)).toBeVisible();
  await expect(page.locator("[data-ring-card]")).toHaveCount(12);
  await expect(page.locator("img")).toHaveCount(0);

  await page.locator('[data-ring-card="joon-ho-park"]').click();
  await expect(page).toHaveURL(/\/core\/team\/joon-ho-park$/);
  await expect(surface(page).getByRole("heading", { name: "Joon-Ho Park" })).toBeVisible();
  await expect(surface(page)).toContainText("CTO / Protocol Architect");
  await expect(surface(page)).toContainText("Profile not yet verified");
  await expect(surface(page)).not.toContainText("KAIST");
  await expect(surface(page)).not.toContainText("Bitcoin Core");
  await expect(surface(page).getByRole("link")).toHaveCount(0);

  await page.getByRole("button", { name: "Back to Team" }).click();
  await expect(page).toHaveURL(/\/core\/team$/);
  await expect(page.locator('[data-ring-card="joon-ho-park"]')).toBeFocused();
});
