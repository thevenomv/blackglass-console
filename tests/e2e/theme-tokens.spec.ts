import { expect, test } from "@playwright/test";

async function assertBgBase(page: import("@playwright/test").Page, expected: string) {
  const v = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--bg-base").trim(),
  );
  expect(v.toLowerCase()).toBe(expected.toLowerCase());
}

test.describe("Theme CSS tokens", () => {
  test("light theme variables on dashboard", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("blackglass-theme", "light");
    });
    await page.goto("/dashboard");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await assertBgBase(page, "#f1f5f9");
  });

  test("dark theme variables after toggle", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("blackglass-theme", "light");
    });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await assertBgBase(page, "#0f1419");
  });

  test("marketing home respects stored dark preference", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("blackglass-theme", "dark");
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
