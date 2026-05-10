import { expect, test } from "@playwright/test";

test.describe("Free tools area", () => {
  test("marketing nav exposes Tools link", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /^Tools$/ }).first()).toBeVisible();
  });

  test("/tools index lists all three tools and links to the live one", async ({
    page,
  }) => {
    await page.goto("/tools");
    await expect(
      page.getByRole("heading", { name: "Free utilities for Linux fleets and cloud accounts" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cloud Waste Estimator" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Linux Drift Risk Score" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Cloud Inventory Diff Visualiser" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Open tool" }).first()).toHaveAttribute(
      "href",
      "/tools/cloud-waste-estimator",
    );
  });

  test("/tools/cloud-waste-estimator updates the estimate as inputs change", async ({
    page,
  }) => {
    await page.goto("/tools/cloud-waste-estimator");
    await expect(
      page.getByRole("heading", { name: "Cloud Waste Estimator" }),
    ).toBeVisible();

    // Empty state — totals show $0 in the result panel.
    const summary = page.getByLabel("Estimate results");
    await expect(summary.getByText(/\$0–\$0\/mo/).first()).toBeVisible();

    // Enter 10 medium DigitalOcean droplets and 100% idle. Use the exact
    // top-level instance-count label — the optional override panel reuses
    // the same prefix with " $/mo" appended.
    const mediumField = page.getByLabel("Medium (~4 vCPU)", { exact: true });
    await mediumField.fill("10");
    const idleSlider = page.getByRole("slider", {
      name: /Approximate % you believe are idle/,
    });
    await idleSlider.fill("100");

    // The result range should now be greater than zero — find any "$N–$M/mo"
    // text inside the results panel that isn't $0–$0.
    await expect
      .poll(async () => {
        const text = await summary
          .getByText(/\$\d+(?:,\d+)?–\$\d+(?:,\d+)?\/mo/)
          .first()
          .textContent();
        return text ?? "";
      })
      .not.toMatch(/^\$0–\$0\/mo$/);
  });

  test("/tools/cloud-waste-estimator shows preview tools sub-nav", async ({ page }) => {
    await page.goto("/tools/cloud-waste-estimator");
    const subNav = page.getByRole("navigation", { name: "Tools sub-navigation" });
    await expect(subNav).toBeVisible();
    await expect(subNav.getByRole("link", { name: "Linux Drift Risk" })).toBeVisible();
    await expect(subNav.getByRole("link", { name: "Inventory Diff" })).toBeVisible();
  });

  test("/tools/linux-drift-risk computes a score that reacts to inputs", async ({
    page,
  }) => {
    await page.goto("/tools/linux-drift-risk");
    await expect(
      page.getByRole("heading", { name: "Linux Drift Risk Score" }),
    ).toBeVisible();

    // Default mature posture should produce score 0 / "Low" band.
    await expect(page.getByText(/^0$/).first()).toBeVisible();
    await expect(page.getByText("Low", { exact: true }).first()).toBeVisible();

    // Pick the riskiest answer in each radio group — radio name = label text.
    await page.getByRole("radio", { name: /Manual SSH and shell scripts/i }).check();
    await page.getByRole("radio", { name: /Ad-hoc/i }).check();
    await page.getByRole("radio", { name: /SOC 2/i }).check();
    await page.getByRole("radio", { name: /^None \(logs only/i }).check();

    // Score must now be > 0 and band is no longer "Low".
    await expect
      .poll(async () => {
        const txt = await page
          .locator("text=/^[1-9][0-9]?$|^100$/")
          .first()
          .textContent();
        return Number(txt ?? "0");
      })
      .toBeGreaterThan(20);

    await expect(page.getByRole("link", { name: /baselines drift/i })).toHaveAttribute(
      "href",
      "/product",
    );
  });

  test("/tools/cloud-inventory-diff parses two uploads and renders a categorised diff", async ({
    page,
  }) => {
    await page.goto("/tools/cloud-inventory-diff");
    await expect(
      page.getByRole("heading", { name: "Cloud Inventory Diff Visualiser" }),
    ).toBeVisible();

    // Sample JSON schema is documented on the page.
    await expect(page.getByText(/Expected JSON shape/i)).toBeVisible();

    const before = JSON.stringify({
      snapshot_id: "before",
      provider: "do",
      resources: [
        { kind: "droplet", id: "a", region: "lon1", size: "s-2vcpu-4gb" },
        { kind: "droplet", id: "b", region: "lon1" },
      ],
    });
    const after = JSON.stringify({
      snapshot_id: "after",
      provider: "do",
      resources: [
        { kind: "droplet", id: "a", region: "lon1", size: "s-4vcpu-8gb" },
        { kind: "snapshot", id: "snap-1", size_gb: 40 },
      ],
    });

    // The hidden inputs accept JSON; use setInputFiles instead of simulating
    // an HTML5 drag/drop event (Playwright supports both, this is simpler).
    const inputs = page.locator('input[type="file"]');
    await inputs.nth(0).setInputFiles({
      name: "before.json",
      mimeType: "application/json",
      buffer: Buffer.from(before, "utf-8"),
    });
    await inputs.nth(1).setInputFiles({
      name: "after.json",
      mimeType: "application/json",
      buffer: Buffer.from(after, "utf-8"),
    });

    // Diff totals: 1 added (snap-1), 1 removed (b), 1 changed (a.size).
    // Each label appears in three places (tile, byKind table header, diff
    // pill) — assert .first() to dodge strict-mode collisions, since the
    // important behaviour is "results section rendered with all three
    // categories", not "label appears exactly once".
    const results = page.getByRole("region", { name: "Diff results" });
    await expect(results).toBeVisible();
    await expect(results.getByText("Added", { exact: true }).first()).toBeVisible();
    await expect(results.getByText("Removed", { exact: true }).first()).toBeVisible();
    await expect(results.getByText("Changed", { exact: true }).first()).toBeVisible();

    // The op pills (lowercase) confirm one row per category.
    await expect(results.getByText("added", { exact: true })).toBeVisible();
    await expect(results.getByText("removed", { exact: true })).toBeVisible();
    await expect(results.getByText("changed", { exact: true })).toBeVisible();

    // Resource ids should appear in the diff list.
    await expect(results.getByText("snap-1", { exact: false })).toBeVisible();

    await expect(page.getByRole("link", { name: "See Charon →" })).toHaveAttribute(
      "href",
      "/product#charon",
    );
  });

  test("POST /api/tools/cloud-waste-report rejects malformed payloads", async ({
    request,
  }) => {
    const res = await request.post("/api/tools/cloud-waste-report", {
      data: { email: "not-an-email" },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_failed");
  });

  test("POST /api/tools/cloud-waste-report accepts a well-formed payload", async ({
    request,
  }) => {
    const res = await request.post("/api/tools/cloud-waste-report", {
      data: {
        email: "test@example.com",
        org: "Test",
        providers: ["do"],
        totals: { point: 100, low: 80, high: 120 },
        riskBand: "medium",
      },
    });
    // Either 200 ok (email skipped because no RESEND_API_KEY in test env)
    // or 429 if a previous test exhausted the per-IP bucket. Both are
    // acceptable evidence the route is wired up.
    expect([200, 429]).toContain(res.status());
  });

  test("POST /api/tools/cloud-waste-report duplicate-recipient request returns 200 OK (no oracle)", async ({
    request,
  }) => {
    // Use a unique address per test run so the 24h per-recipient cap
    // doesn't collide with previous CI runs.
    const email = `dupe-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
    const payload = {
      email,
      org: "Dupe Co",
      providers: ["do"] as const,
      totals: { point: 100, low: 80, high: 120 },
      riskBand: "medium" as const,
    };
    const first = await request.post("/api/tools/cloud-waste-report", { data: payload });
    expect([200, 429]).toContain(first.status());

    // Second submission for the SAME email must NOT 429 — that would let an
    // attacker probe whether a victim address has been mailed recently.
    // Per-recipient caps are enforced by silent 200 OK instead.
    if (first.status() === 200) {
      const second = await request.post("/api/tools/cloud-waste-report", { data: payload });
      expect(second.status()).toBe(200);
      const body = (await second.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    }
  });
});
