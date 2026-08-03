import { test, expect } from "@playwright/test";

/**
 * Placeholder mapped from e2e/tab-suites.json "Example" tab.
 * Replace with real sheet-driven specs (Category=Playwright / blank rows only).
 * Category=UI → `__tests__/example.unit.test.tsx` via unitSpecs.
 */
test("TC_001: example placeholder — replace with sheet cases", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/.*/);
});
