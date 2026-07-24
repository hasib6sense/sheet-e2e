import { test as setup, expect } from "@playwright/test";
import path from "node:path";

/**
 * Scaffolded by @6sense/sheet-e2e init.
 * Adjust selectors to match your sign-in page.
 * Credentials: TEST_SIGNIN_EMAIL / TEST_SIGNIN_PASSWORD (or sheet defaults in your specs).
 */
const authFile = path.join(__dirname, "../playwright/.auth/user.json");

const EMAIL = process.env.TEST_SIGNIN_EMAIL ?? "user@example.com";
const PASSWORD = process.env.TEST_SIGNIN_PASSWORD ?? "changeme";

setup("authenticate for E2E", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText(/sign in/i).first()).toBeVisible();

  const form = page.locator("form").first();
  if (await form.count()) {
    await form.evaluate((el) => el.setAttribute("novalidate", "true"));
  }

  const email = page.getByPlaceholder(/email/i).or(page.getByLabel(/email/i)).first();
  const password = page.getByPlaceholder(/password/i).or(page.getByLabel(/password/i)).first();
  await email.fill(EMAIL);
  await password.fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();

  await expect(page).toHaveURL(/\/(dashboard|projects|home|app)/, { timeout: 60_000 });
  await page.context().storageState({ path: authFile });
});
