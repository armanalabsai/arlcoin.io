import { expect, test } from "@playwright/test";

import { FORMS, formsOpen } from "../../src/content/forms.ts";

// The whitelist, contact and privacy pages. With no form access key the forms show a closed
// notice; with one, submissions are intercepted here so nothing leaves the test.

const PAGES = [
  ["/whitelist", "Whitelist"],
  ["/contact", "Contact the team"],
  ["/privacy", "Privacy"],
] as const;

for (const [path, heading] of PAGES) {
  test(`${path} renders without errors or horizontal scroll`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole("link", { name: "ARL overview" })).toBeVisible();
    const hscroll = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(hscroll).toBe(0);
    expect(errors).toEqual([]);
  });
}

test("the Core header and footer link to the whitelist and contact pages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Whitelist" }).click();
  await expect(page).toHaveURL(/\/whitelist\/?$/);
  await page.goto("/");
  const footer = page.getByRole("navigation", { name: "Site" });
  await expect(footer.getByRole("link", { name: "Contact" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Privacy" })).toBeVisible();
});

test.describe("forms closed", () => {
  test.skip(formsOpen(), "a form access key is configured");

  test("whitelist and contact show the closed notice and no form", async ({ page }) => {
    for (const path of ["/whitelist", "/contact"]) {
      await page.goto(path);
      await expect(page.getByTestId("form-closed")).toBeVisible();
      await expect(page.locator("form")).toHaveCount(0);
    }
  });
});

test.describe("forms open", () => {
  test.skip(!formsOpen(), "no form access key is configured");

  test("whitelist validates, checksums the address and sends one request", async ({ page }) => {
    const bodies: Record<string, unknown>[] = [];
    await page.route(FORMS.endpoint, async (route) => {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ json: { success: true, body: { message: "ok" } } });
    });
    await page.goto("/whitelist");
    const form = page.getByRole("form", { name: "Whitelist registration" });

    await form.getByRole("button", { name: "Register" }).click();
    await expect(form.getByRole("alert").first()).toBeVisible();
    expect(bodies).toHaveLength(0);

    await form.getByLabel("Wallet address").fill("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed");
    await form.getByLabel("Email").fill("holder@example.com");
    await form.getByRole("checkbox").nth(0).check();
    await form.getByRole("checkbox").nth(1).check();
    await form.getByRole("button", { name: "Register" }).click();

    await expect(page.getByRole("status")).toContainText("You are registered");
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      wallet: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
      email: "holder@example.com",
      subject: "ARL whitelist registration",
    });
  });

  test("whitelist rejects a mistyped checksummed address", async ({ page }) => {
    await page.goto("/whitelist");
    const form = page.getByRole("form", { name: "Whitelist registration" });
    await form.getByLabel("Wallet address").fill("0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
    await form.getByRole("button", { name: "Register" }).click();
    await expect(form.getByText("Enter a valid EVM address")).toBeVisible();
  });

  test("contact shows an error when delivery fails", async ({ page }) => {
    await page.route(FORMS.endpoint, (route) =>
      route.fulfill({ status: 500, json: { success: false } }),
    );
    await page.goto("/contact");
    const form = page.getByRole("form", { name: "Contact" });
    await form.getByLabel("Email").fill("press@example.com");
    await form.getByLabel("Topic").selectOption("Press");
    await form.getByLabel("Message").fill("A question about the ARL launch timeline.");
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "Send message" }).click();
    await expect(form.getByText("The form could not be sent")).toBeVisible();
  });
});
