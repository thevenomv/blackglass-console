import { expect, test } from "@playwright/test";

test.describe("BLACKGLASS console smoke", () => {
  test("health endpoint responds", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("api v1 hosts returns inventory", async ({ request }) => {
    const res = await request.get("/api/v1/hosts");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.items)).toBeTruthy();
    expect(body.items.length).toBeGreaterThan(0);
  });

  test("api v1 scan job reaches succeeded", async ({ request }) => {
    const post = await request.post("/api/v1/scans", {
      data: { host_ids: [] },
    });
    expect(post.ok()).toBeTruthy();
    const { id } = await post.json();
    expect(id).toBeTruthy();

    await expect
      .poll(
        async () => {
          const r = await request.get(`/api/v1/scans/${id}`);
          if (!r.ok()) return "";
          const j = await r.json();
          return j.status as string;
        },
        { timeout: 20_000, intervals: [150, 250, 400] },
      )
      .toBe("succeeded");
  });

  test("fleet dashboard renders KPI row", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Fleet dashboard" })).toBeVisible();
    await expect(page.getByText("Hosts checked", { exact: true })).toBeVisible();
    await expect(page.getByText("Telemetry coverage & freshness")).toBeVisible();
    await expect(page.getByText("Collectors", { exact: true })).toBeVisible();
    await expect(page.getByText("Fleet heartbeat")).toBeVisible();
    await expect(page.getByRole("button", { name: "Run scan" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Color theme" })).toBeVisible();
    await page.getByRole("button", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("Run scan shows sticky job banner", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Run scan" }).click();
    await expect(page.getByText("Fleet integrity scan")).toBeVisible();
    await expect(page.getByRole("status", { name: /active integrity scans/i })).toBeVisible();
  });

  test("hosts table loads", async ({ page }) => {
    await page.goto("/hosts");
    await expect(page.getByRole("heading", { name: "Hosts" })).toBeVisible();
    await expect(page.getByText("host-07")).toBeVisible();
  });

  test("audit events api lists entries", async ({ request }) => {
    const res = await request.get("/api/v1/audit/events?limit=10");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.items)).toBeTruthy();
  });

  test("workspace incident page renders", async ({ page }) => {
    await page.goto("/workspace");
    await expect(page.getByRole("heading", { name: "Incident workspace" })).toBeVisible();
    await expect(page.getByText("INC-2047")).toBeVisible();
  });

  test("demo script page", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByRole("heading", { name: "Partner demo script" })).toBeVisible();
  });

  test("evidence bundle meta returns JSON", async ({ request }) => {
    const res = await request.get("/api/v1/evidence/bundles/bundle-production-weekly");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.bundle_id).toBeTruthy();
    expect(body.download_url).toContain("/file");
  });

  test("command palette opens and closes with keyboard shortcut", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command palette" })).not.toBeVisible();
  });

  test("command palette navigates to hosts via search", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Meta+k");
    await page.getByPlaceholder("Search routes…").fill("hosts");
    await page.getByRole("option").first().click();
    await expect(page).toHaveURL("/hosts");
  });

  test("host detail tab deep-linking via ?tab= param", async ({ page }) => {
    await page.goto("/hosts/host-07?tab=users");
    await expect(page.getByRole("tab", { name: /users/i })).toHaveAttribute("aria-selected", "true");
  });

  test("dashboard time range selector updates label", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("group", { name: "Time range" })).toBeVisible();
    await page.getByRole("group", { name: "Time range" }).getByText("7d").click();
    // KPI delta text should reflect 7d
    await expect(page.getByText("+3 from last week")).toBeVisible();
  });

  test("evidence search filters bundles", async ({ page }) => {
    await page.goto("/evidence");
    await page.getByRole("searchbox", { name: "Search evidence bundles" }).fill("host-07");
    await expect(page.getByText("host-07-incident")).toBeVisible();
    await expect(page.getByText("production-weekly")).not.toBeVisible();
  });

  test("reports generate report modal opens and closes", async ({ page }) => {
    await page.goto("/reports");
    await page.getByRole("button", { name: "Generate report" }).first().click();
    await expect(page.getByRole("dialog", { name: "Generate new report" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog", { name: "Generate new report" })).not.toBeVisible();
  });

  test("onboarding flow has 6 steps", async ({ page }) => {
    await page.goto("/onboarding");
    // 6 step indicators visible
    for (let i = 1; i <= 6; i++) {
      await expect(page.getByText(String(i), { exact: true }).first()).toBeVisible();
    }
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("What you unlock")).toBeVisible();
  });

  test("workspace accepts incident and host search params", async ({ page }) => {
    await page.goto("/workspace?incident=INC-9999&host=host-07");
    await expect(page.getByText("INC-9999")).toBeVisible();
  });

  test("drift events bulk select enables bulk actions toolbar", async ({ page }) => {
    await page.goto("/drift");
    const checkboxes = page.locator('input[type="checkbox"]');
    await checkboxes.nth(1).check(); // first row checkbox (nth(0) is select-all)
    await expect(page.getByRole("toolbar", { name: "Bulk actions" })).toBeVisible();
    await expect(page.getByText("1 selected")).toBeVisible();
  });
});
