import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Automated accessibility scans on key shell routes (mock mode).
 * Tag with @a11y for selective runs: npx playwright test --grep @a11y
 */
test.describe("@a11y console pages", () => {
  const paths = ["/dashboard", "/hosts", "/drift", "/evidence", "/settings"] as const;

  for (const path of paths) {
    test(`no serious a11y violations: ${path}`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .disableRules(["color-contrast"]) /* theme tokens are tuned separately */
        .analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }
});
