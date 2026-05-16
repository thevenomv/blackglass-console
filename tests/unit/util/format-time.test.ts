import { describe, expect, it } from "vitest";

import { formatAbsoluteUtc, formatRelativeTime } from "@/lib/format-time";

const NOW = Date.parse("2026-05-09T10:00:00Z");

describe("formatRelativeTime", () => {
  it("returns the empty placeholder for null/undefined/empty input", () => {
    expect(formatRelativeTime(null)).toBe("—");
    expect(formatRelativeTime(undefined)).toBe("—");
    expect(formatRelativeTime("")).toBe("—");
  });

  it("returns the empty placeholder for unparseable input", () => {
    expect(formatRelativeTime("not-a-date")).toBe("—");
  });

  it("respects a custom empty placeholder", () => {
    expect(formatRelativeTime(null, { empty: "Never" })).toBe("Never");
  });

  it("renders 'just now' for inputs within the last ~45s", () => {
    const iso = new Date(NOW - 30_000).toISOString();
    expect(formatRelativeTime(iso, { now: NOW })).toBe("just now");
  });

  it("clamps minor clock skew (future timestamps) to 'just now'", () => {
    const iso = new Date(NOW + 5_000).toISOString();
    expect(formatRelativeTime(iso, { now: NOW })).toBe("just now");
  });

  it("renders minutes ago for inputs within the last hour", () => {
    const iso = new Date(NOW - 5 * 60_000).toISOString();
    expect(formatRelativeTime(iso, { now: NOW })).toBe("5m ago");
  });

  it("renders hours ago for inputs within the last day", () => {
    const iso = new Date(NOW - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(iso, { now: NOW })).toBe("3h ago");
  });

  it("renders days ago for inputs within the last ~30d", () => {
    const iso = new Date(NOW - 7 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(iso, { now: NOW })).toBe("7d ago");
  });

  it("falls back to a compact absolute date for older inputs", () => {
    const iso = "2026-01-15T10:00:00Z";
    const out = formatRelativeTime(iso, { now: NOW });
    expect(out).toMatch(/15 Jan 2026/);
  });
});

describe("formatAbsoluteUtc", () => {
  it("returns the empty placeholder for null/undefined/invalid input", () => {
    expect(formatAbsoluteUtc(null)).toBe("—");
    expect(formatAbsoluteUtc(undefined)).toBe("—");
    expect(formatAbsoluteUtc("nope")).toBe("—");
  });

  it("renders a date+time UTC string for valid input", () => {
    const out = formatAbsoluteUtc("2026-05-09T10:00:00Z");
    // Locale-dependent ordering, but always contains the date pieces and the
    // UTC suffix we tack on at the end.
    expect(out).toMatch(/9 May 2026/);
    expect(out).toMatch(/UTC$/);
  });
});
