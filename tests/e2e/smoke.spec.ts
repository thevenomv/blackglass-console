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
});
