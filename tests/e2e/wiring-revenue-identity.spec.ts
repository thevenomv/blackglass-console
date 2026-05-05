import { expect, test } from "@playwright/test";

/**
 * Revenue + identity URLs and API wiring (mock E2E server clears Clerk + Stripe by default).
 */
test.describe("Revenue & identity wiring", () => {
  test("pricing page loads with plan CTAs", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: /scale with your fleet/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /start .* plan/i }).first()).toBeVisible();
  });

  test("checkout success page renders without Stripe session", async ({ page }) => {
    await page.goto("/pricing/success");
    await expect(page.getByRole("heading", { name: /you.*team/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /go to console/i })).toHaveAttribute("href", "/dashboard");
    await expect(page.getByRole("link", { name: /add your first host/i })).toHaveAttribute("href", "/hosts");
  });

  test("POST /api/checkout returns billing_unavailable when Stripe key not configured", async ({
    request,
  }) => {
    const res = await request.post("/api/checkout", {
      data: { planCode: "starter" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(503);
    const body = (await res.json()) as { error?: string; detail?: string };
    expect(body.error).toBe("billing_unavailable");
    expect(body.detail).toBeTruthy();
  });

  test("POST /api/checkout/webhook rejects requests without Stripe signature", async ({
    request,
  }) => {
    const res = await request.post("/api/checkout/webhook", {
      data: "{}",
      headers: { "Content-Type": "application/json" },
    });
    expect([400, 500]).toContain(res.status());
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });

  test("legacy login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("Clerk routes redirect to /login when Clerk is not configured (default E2E)", async ({
    page,
  }) => {
    test.skip(process.env.PLAYWRIGHT_CLERK === "1", "Clerk keys injected for this run");
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
    await page.goto("/sign-up");
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
  });

  test("homepage trial link resolves to a non-dead path", async ({ page }) => {
    await page.goto("/");
    const trial = page.getByRole("link", { name: /start free trial/i }).first();
    const href = await trial.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).not.toBe("#");
    const nav = await trial.evaluate((el: HTMLAnchorElement) => {
      const u = new URL(el.href);
      return u.pathname;
    });
    const probe = await page.request.get(nav);
    expect(probe.ok() || probe.status() === 307 || probe.status() === 308).toBeTruthy();
  });
});
