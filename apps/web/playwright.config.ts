import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the production build (`next build` first).
// PW_CHROMIUM_PATH lets environments with a preinstalled Chromium use it
// instead of downloading one.
const executablePath = process.env.PW_CHROMIUM_PATH;
const launchOptions = executablePath ? { executablePath } : {};
const PORT = 3217;

export default defineConfig({
  testDir: "test/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    launchOptions,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
