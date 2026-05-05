import { expect, test } from "@playwright/test";

/**
 * Pixel snapshots — not run in default `npm run test:e2e` (see `--grep-invert @pixel`).
 * First time / after intentional UI change:
 *   npx playwright test --grep @pixel --update-snapshots
 */
test.describe("Theme screenshots", { tag: "@pixel" }, () => {
  test("landing light", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("blackglass-theme", "light");
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await expect(page).toHaveScreenshot("landing-light.png", {
      maxDiffPixelRatio: 0.04,
      animations: "disabled",
    });
  });

  test("landing dark", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("blackglass-theme", "dark");
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await expect(page).toHaveScreenshot("landing-dark.png", {
      maxDiffPixelRatio: 0.04,
      animations: "disabled",
    });
  });
});
