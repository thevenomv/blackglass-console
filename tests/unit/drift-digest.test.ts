import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  digestEveryMs,
  digestInterval,
  digestWindowLabel,
  digestWindowMs,
} from "../../src/lib/server/services/drift-digest-service";
import {
  driftDigestHtml,
  driftDigestText,
} from "../../src/lib/email/templates/drift-digest";

const ORIGINAL = process.env.DRIFT_DIGEST_INTERVAL;

describe("drift-digest cadence helpers", () => {
  beforeEach(() => {
    delete process.env.DRIFT_DIGEST_INTERVAL;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.DRIFT_DIGEST_INTERVAL;
    } else {
      process.env.DRIFT_DIGEST_INTERVAL = ORIGINAL;
    }
  });

  it("defaults to weekly when env is unset", () => {
    expect(digestInterval()).toBe("weekly");
  });

  it("respects 'off' to disable digests", () => {
    process.env.DRIFT_DIGEST_INTERVAL = "off";
    expect(digestInterval()).toBe("off");
  });

  it("normalises 'DAILY' (case-insensitive) to daily", () => {
    process.env.DRIFT_DIGEST_INTERVAL = "DAILY";
    expect(digestInterval()).toBe("daily");
  });

  it("falls back to weekly on garbage input rather than crashing the worker", () => {
    process.env.DRIFT_DIGEST_INTERVAL = "fortnightly";
    expect(digestInterval()).toBe("weekly");
  });

  it("computes 24h cadence + window for daily", () => {
    expect(digestEveryMs("daily")).toBe(24 * 60 * 60 * 1000);
    expect(digestWindowMs("daily")).toBe(24 * 60 * 60 * 1000);
    expect(digestWindowLabel("daily")).toBe("last 24 hours");
  });

  it("computes 7d cadence + window for weekly", () => {
    expect(digestEveryMs("weekly")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(digestWindowMs("weekly")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(digestWindowLabel("weekly")).toBe("last 7 days");
  });
});

describe("drift-digest email template", () => {
  const baseOpts = {
    workspaceName: "Acme Co",
    appUrl: "https://example.com",
    windowLabel: "last 7 days",
    windowStartIso: "2026-05-01T00:00:00.000Z",
    windowEndIso: "2026-05-08T00:00:00.000Z",
    totals: { new: 12, high: 3, medium: 7, low: 2, remediated: 5 },
    topCategories: [
      { category: "ssh", count: 6 },
      { category: "package", count: 4 },
    ],
    affectedHosts: 9,
  };

  it("includes the workspace name and totals in HTML", () => {
    const html = driftDigestHtml(baseOpts);
    expect(html).toContain("Acme Co");
    // Counts use locale formatting; the underlying digit must still be present.
    expect(html).toContain(">12<");
    expect(html).toContain(">3<");
    expect(html).toContain(">9<");
    expect(html).toContain("https://example.com/drift?lifecycle=open");
  });

  it("escapes HTML metacharacters in the workspace name", () => {
    const html = driftDigestHtml({
      ...baseOpts,
      workspaceName: "<script>x()</script>",
    });
    expect(html).not.toContain("<script>x()");
    expect(html).toContain("&lt;script&gt;x()");
  });

  it("renders the headline as 'no high-severity' when high == 0", () => {
    const html = driftDigestHtml({
      ...baseOpts,
      totals: { ...baseOpts.totals, high: 0 },
    });
    expect(html).toContain("No high-severity drift");
  });

  it("renders a plain-text companion for tenants behind text-only filters", () => {
    const text = driftDigestText(baseOpts);
    expect(text).toContain("Acme Co");
    expect(text).toContain("High:       3");
    expect(text).toContain("Affected hosts: 9");
    expect(text).toContain(
      "Open the drift queue: https://example.com/drift?lifecycle=open",
    );
  });
});
