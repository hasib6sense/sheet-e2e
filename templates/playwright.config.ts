import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const authFile = path.join(__dirname, "playwright/.auth/user.json");

/**
 * Specs that must start logged out (no auth.setup storage).
 * Extend this regex when you add more unauthenticated suites.
 */
const unauthenticatedSpecMatch =
  /signin\.spec\.ts|signup\.spec\.ts|sign-up\.spec\.ts|forgotpassword\.spec\.ts|forgot-password\.spec\.ts/;

/**
 * Scaffolded by @6sense/sheet-e2e init.
 * - chromium-unauth → auth UI (sign-in / register / forgot password)
 * - chromium → authenticated features (depends on auth.setup)
 * JSON reporter path must match E2E_RESULTS_FILE (default playwright-results.json).
 */
export default defineConfig({
  testDir: "./playwright-tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 1,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "playwright-results.json" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium-unauth",
      testMatch: unauthenticatedSpecMatch,
      use: {
        ...devices["Desktop Chrome"],
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts/, unauthenticatedSpecMatch],
    },
  ],
  webServer: {
    command: process.env.PLAYWRIGHT_WEB_SERVER ?? "npm run start",
    url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000/",
    reuseExistingServer: !process.env.CI,
    timeout: 10 * 60 * 1000,
  },
});
