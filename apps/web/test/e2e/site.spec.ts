import { expect, test } from "@playwright/test";

import { DOCS, docPath } from "../../src/content/docs.ts";
import { FAQ } from "../../src/content/faq.ts";
import { SOLUTIONS } from "../../src/content/solutions.ts";

// The landing page, the FAQ, the published documents and site-wide rules: no links to a code
// host, touch targets of at least 44px, no horizontal scroll.

const PAGES = [
  "/",
  "/faq",
  "/docs",
  ...DOCS.map((d) => docPath(d.slug)),
  ...SOLUTIONS.map((s) => `/${s.slug}`),
];

test("the landing page leads to the whitelist and the Core", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "The onchain token for decentralized AI and compute services.",
    }),
  ).toBeVisible();
  const cta = page.getByRole("main").getByRole("link", { name: "Join the whitelist" }).first();
  await cta.click();
  await expect(page).toHaveURL(/\/whitelist\/?$/);
  await page.goto("/");
  await page.getByRole("link", { name: "Explore the Core ›" }).click();
  await expect(page).toHaveURL(/\/core\/?$/);
  await expect(page.getByTestId("arl-core")).toBeVisible();
});

test("the landing page shows the launch route, open with the Base Mainnet token", async ({
  page,
}) => {
  await page.goto("/");
  const launch = page.locator("section", {
    has: page.getByRole("heading", { name: "Launch on Base." }),
  });
  await launch.scrollIntoViewIfNeeded();
  await expect(launch.getByTestId("launch-when-1")).toHaveText("Open now");
  await expect(launch.getByTestId("launch-when-2")).toHaveText("Open now");
  await expect(launch.getByTestId("launch-when-3")).toHaveText("Open");
  await expect(launch.getByTestId("launch-when-4")).toHaveText("Open");
  // No airdrop at the launch: the route never links to a claim.
  await expect(launch.getByRole("link", { name: /claim/i })).toHaveCount(0);
  await expect(launch).toContainText("There is no airdrop at launch.");
  await expect(launch.getByRole("button", { name: "Add ARL to your wallet" })).toHaveCount(1);
  await launch.getByRole("link", { name: "How to get ARL ›" }).click();
  await expect(page).toHaveURL(/\/buy\/?$/);
});

test("the FAQ page lists every question and carries FAQPage markup", async ({ page }) => {
  await page.goto("/faq");
  for (const f of FAQ) await expect(page.locator("summary", { hasText: f.question })).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const faq = ld
    .map((t) => JSON.parse(t) as { "@type": string })
    .find((d) => d["@type"] === "FAQPage");
  expect(faq).toBeTruthy();
});

test("every published document renders", async ({ page }) => {
  for (const d of DOCS) {
    const res = await page.goto(docPath(d.slug));
    expect(res?.status(), d.slug).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: d.title })).toBeVisible();
    await expect(page.locator(".doc-prose")).not.toBeEmpty();
  }
});

test("every landing page has its keyword, metadata, structured data and a way into the app", async ({
  page,
}) => {
  for (const s of SOLUTIONS) {
    const res = await page.goto(`/${s.slug}`);
    expect(res?.status(), s.slug).toBe(200);
    await expect(page).toHaveTitle(s.title);
    await expect(page.getByRole("heading", { level: 1, name: s.heading })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`https://arlcoin\\.io/${s.slug}/?$`),
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      s.description,
    );
    const types = (await page.locator('script[type="application/ld+json"]').allTextContents()).map(
      (t) => (JSON.parse(t) as { "@type": string })["@type"],
    );
    for (const type of ["BreadcrumbList", "TechArticle", "FAQPage"]) expect(types).toContain(type);
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: s.appLabel }).first()).toHaveAttribute(
      "href",
      s.appPath,
    );
    await expect(main.getByRole("link", { name: "Get ARL" }).first()).toBeVisible();
    // Every other landing page is linked from this one, and all five from the footer.
    for (const o of SOLUTIONS.filter((o) => o.slug !== s.slug))
      await expect(main.locator(`a[href^="/${o.slug}"]`)).toHaveCount(1);
    await expect(
      page.getByRole("navigation", { name: "Use cases", exact: true }).getByRole("link"),
    ).toHaveCount(SOLUTIONS.length);
  }
});

test("llms.txt is served", async ({ request }) => {
  const res = await request.get("/llms.txt");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("# ARL");
});

for (const path of PAGES) {
  test(`${path} has no broken code-host links and no horizontal scroll`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path);
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    // The project's own code host account is unavailable; links to it would be broken.
    for (const href of hrefs) expect(href, href).not.toMatch(/gokturkalazdaghan-dot/);
    const hscroll = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(hscroll).toBe(0);
    expect(errors).toEqual([]);
  });
}

test("header, footer and landing controls are at least 44px tall", async ({ page }) => {
  for (const path of ["/", "/faq", "/whitelist"]) {
    await page.goto(path);
    const small = await page
      .locator("header a, header button, footer a, main a.inline-flex, main button")
      .evaluateAll((els) =>
        els
          // Layout size, so the scale-down of slides that are not in focus does not count.
          .filter((e) => {
            const el = e as HTMLElement;
            return el.offsetWidth > 0 && el.offsetHeight > 0 && el.offsetHeight < 44;
          })
          .map(
            (e) => `${e.textContent?.trim() ?? ""} ${String((e as HTMLElement).offsetHeight)}px`,
          ),
      );
    expect(small, path).toEqual([]);
  }
});

test("the technology previews swipe and run, and say they are simulated", async ({ page }) => {
  await page.goto("/");
  const rail = page.getByRole("group", { name: /1 of 4: AI Payments/ });
  await rail.scrollIntoViewIfNeeded();
  await expect(rail).toContainText("simulated");
  await rail.getByRole("button", { name: "Run a request" }).click();
  await expect(rail).toContainText("never left your wallet", { timeout: 5000 });
  await page.getByRole("button", { name: "Show ZK Privacy" }).click();
  const zk = page.getByRole("group", { name: /3 of 4: ZK Privacy/ });
  await expect(zk).toHaveAttribute("data-active", "true", { timeout: 5000 });
  await zk.getByRole("button", { name: "AI payments first" }).click();
  await expect(zk).toContainText("Proof verified", { timeout: 5000 });
});

test("the brand link goes home, reloads its content and starts it at the top", async ({ page }) => {
  await page.goto("/faq");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole("link", { name: "ARL home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("the header shows ARL as live only while Base Mainnet answers with the token", async ({
  page,
}) => {
  // totalSupply() = 21,000,000 ARL (18 decimals).
  await page.route("https://mainnet.base.org/**", (route) =>
    route.fulfill({
      json: { jsonrpc: "2.0", id: 1, result: "0x" + (21_000_000n * 10n ** 18n).toString(16) },
    }),
  );
  await page.goto("/faq");
  const status = page.locator(
    'header a[href="https://basescan.org/token/0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4"]',
  );
  await expect(status).toHaveAttribute("data-state", "live");
  await expect(status).toHaveAttribute("title", /21,000,000 ARL total supply/);

  await page.unroute("https://mainnet.base.org/**");
  await page.route("https://mainnet.base.org/**", (route) => route.abort());
  await page.reload();
  await expect(status).toHaveAttribute("data-state", "down");
});

test("navigation between pages stays in the same document, through header links and plain links", async ({
  page,
}) => {
  await page.goto("/faq");
  await page.evaluate(() => {
    (window as unknown as { sameDocument?: boolean }).sameDocument = true;
  });

  // Get ARL shows in the header at every width (Contact gives way on narrow screens).
  await page.locator("header").getByRole("link", { name: "Get ARL" }).click();
  await expect(page).toHaveURL(/\/buy\/?$/);
  // A plain anchor, as in documents, is navigated inside the app too.
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = `${window.location.origin}/faq/`;
    a.textContent = "plain link";
    a.id = "plain-link";
    document.querySelector("main")?.prepend(a);
  });
  await page.locator("#plain-link").click();
  await expect(page).toHaveURL(/\/faq\/?$/);

  expect(await page.evaluate(() => "sameDocument" in window)).toBe(true);
});
