/**
 * Regression tests for the WinAnsi sanitiser in report-pdf.ts.
 *
 * Background: 2026-05-08 the customer hit
 *   PDF synthesiser threw while rendering "rpt-...":
 *   WinAnsi cannot encode "→" (0x2192)
 *
 * pdf-lib's StandardFonts (Helvetica, Courier, …) ship with a WinAnsi/CP1252
 * encoding table. Any drift event title or audit detail containing a glyph
 * outside that table aborts the entire render. We sanitise at every drawText
 * call site rather than swap to a Unicode TTF (bundle bloat + license review).
 *
 * These tests pin three guarantees:
 *   1. Common Unicode glyphs map to ASCII fallbacks, never throw.
 *   2. Truly unknown codepoints fall back to "?", never throw.
 *   3. End-to-end: generateReportPdf() with a payload full of arrows,
 *      em-dashes, ellipses, smart quotes, etc. still produces a valid PDF.
 */

import { describe, expect, it } from "vitest";
import { generateReportPdf, winAnsi } from "@/lib/server/report-pdf";

describe("winAnsi() — text sanitiser for pdf-lib StandardFonts", () => {
  it("passes ASCII through unchanged", () => {
    expect(winAnsi("Hello, World! 123")).toBe("Hello, World! 123");
  });

  it("passes CP1252 high-range glyphs through unchanged (e.g. middle dot, copyright)", () => {
    expect(winAnsi("Blackglass \u00B7 Confidential \u00A9 2026")).toBe(
      "Blackglass \u00B7 Confidential \u00A9 2026",
    );
  });

  it("replaces the right-arrow that caused the production bug", () => {
    expect(winAnsi("permitrootlogin: yes \u2192 no")).toBe("permitrootlogin: yes -> no");
  });

  it("replaces the broader arrow family", () => {
    expect(winAnsi("\u2190 \u2192 \u2191 \u2193 \u2194 \u21D0 \u21D2 \u21D4")).toBe(
      "<- -> ^ v <-> <= => <=>",
    );
  });

  it("replaces typographic punctuation (em-dash, smart quotes, ellipsis)", () => {
    expect(winAnsi("\u2014 \u201Chello\u201D \u2018world\u2019 \u2026")).toBe(
      `-- "hello" 'world' ...`,
    );
  });

  it("replaces math operators (!=, <=, >=, minus)", () => {
    expect(winAnsi("a \u2260 b, x \u2264 y, p \u2265 q, 5 \u2212 3")).toBe(
      "a != b, x <= y, p >= q, 5 - 3",
    );
  });

  it("replaces check / cross marks", () => {
    expect(winAnsi("\u2713 ok \u2717 fail")).toBe("v ok x fail");
  });

  it("replaces unknown high codepoints with ?, never throws", () => {
    // Han character — definitely not in CP1252 and not in our replacement map.
    expect(winAnsi("CJK: \u4E2D\u6587")).toBe("CJK: ??");
    // An emoji — surrogate-pair-encoded in UTF-16 but the for...of iterator
    // yields it as one codepoint, so the replacement is one "?" not two.
    expect(winAnsi("alert \uD83D\uDEA8")).toBe("alert ?");
  });

  it("treats null / undefined as empty string (defensive)", () => {
    expect(winAnsi(null)).toBe("");
    expect(winAnsi(undefined)).toBe("");
  });
});

describe("generateReportPdf — does not throw on Unicode-heavy payloads", () => {
  it("renders a payload full of arrows, em-dashes, ellipses, and CJK without throwing", async () => {
    const payload = JSON.stringify({
      report_id: "rpt-1778018245406-7f614569",
      scope: "all hosts \u2014 production fleet",
      generated_at: "2026-05-08T20:30:00Z",
      drift_events: [
        {
          id: "d-1",
          title: "sshd permitrootlogin: yes \u2192 no \u2026 unexpected",
          severity: "high",
          category: "ssh_config",
          detectedAt: "2026-05-08T20:00:00Z",
          lifecycle: "new",
        },
        {
          id: "d-2",
          title: "kernel \u2014 sysctl ip_forward toggled (1 \u2260 baseline)",
          severity: "medium",
          category: "kernel",
          detectedAt: "2026-05-08T20:05:00Z",
          lifecycle: "new",
        },
        {
          // CJK characters that the replacement table doesn't cover.
          id: "d-3",
          title: "user \u4E2D\u6587 added to sudo group",
          severity: "low",
          category: "identity",
          detectedAt: "2026-05-08T20:10:00Z",
          lifecycle: "new",
        },
      ],
      recent_audit: [
        {
          at: "2026-05-08T20:30:00Z",
          actor: "alice@example.com",
          action: "remediation.applied",
          detail: "set permitrootlogin \u2192 no on host-07",
        },
      ],
    });

    const bytes = await generateReportPdf(payload);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // Every PDF starts with the %PDF- magic.
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });
});
