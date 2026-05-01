import { expect, test } from "@playwright/test";

/**
 * Optional suite: run with PLAYWRIGHT_LIVE=1 so the dev server starts with
 * NEXT_PUBLIC_USE_MOCK=false (SSR fetches /api/v1/* for fleet + hosts).
 *
 *   PLAYWRIGHT_LIVE=1 npx playwright test tests/e2e/live-ssr.spec.ts
 */
const live = process.env.PLAYWRIGHT_LIVE === "1";

test.describe("SSR (NEXT_PUBLIC_USE_MOCK=false)", () => {
  test.skip(!live, "Set PLAYWRIGHT_LIVE=1 to exercise API-backed SSR");

  test("fleet dashboard loads KPI labels", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Fleet dashboard" })).toBeVisible();
    await expect(page.getByText("Hosts checked", { exact: true })).toBeVisible();
  });
});
