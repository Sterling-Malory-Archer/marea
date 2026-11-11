import { defineConfig, devices } from "@playwright/test";

/*
 * End-to-end tests of the real storefront and admin (browser → Next.js → API → MySQL).
 *
 *   Local (servers already running):  pnpm e2e
 *   Against staging:                  E2E_BASE_URL=https://staging.example.me pnpm e2e
 *   CI starts both servers itself (E2E_START_SERVERS=1).
 *
 * Tests create their own orders, customers and products and clean up products they create.
 * Never point them at production.
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const ci = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  // One worker: journeys share stock and the admin account.
  workers: 1,
  fullyParallel: false,
  retries: ci ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: ci ? [["github"], ["html", { open: "never", outputFolder: "e2e-report" }]] : [["list"]],
  outputDir: "e2e-results",
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-GB",
    timezoneId: "Europe/Podgorica",
    // The sandbox/dev machines may point at an installed Chrome instead of Playwright's download.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/, dependencies: ["setup"] },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/, dependencies: ["setup"] },
  ],
  webServer: process.env.E2E_START_SERVERS
    ? [
        { command: "node apps/api/dist/server.js", url: "http://127.0.0.1:4000/health", timeout: 60_000, reuseExistingServer: false },
        // CI runs the same self-contained server the production container runs.
        { command: process.env.E2E_WEB_COMMAND ?? "pnpm --filter @marea/web start", url: BASE, timeout: 120_000, reuseExistingServer: false, env: { NODE_ENV: "production", PORT: "3000", HOSTNAME: "127.0.0.1" } },
      ]
    : undefined,
});
