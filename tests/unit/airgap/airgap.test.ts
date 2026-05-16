/**
 * Unit tests for the air-gapped install mode helper.
 *
 * Covers the env flag detection + the internal-host allow-list. The
 * dispatcher integration (skipping outbound webhooks / email / PD)
 * is exercised in the dispatcher's own test files.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAirgapped,
  isInternalUrl,
  shouldSkipForAirgap,
  airgapStatus,
} from "@/lib/server/airgap";

afterEach(() => {
  delete process.env.BLACKGLASS_AIRGAPPED;
});

describe("isAirgapped", () => {
  it("returns false by default", () => {
    expect(isAirgapped()).toBe(false);
  });

  it("accepts true / 1 / yes (case-insensitive)", () => {
    process.env.BLACKGLASS_AIRGAPPED = "true";
    expect(isAirgapped()).toBe(true);
    process.env.BLACKGLASS_AIRGAPPED = "TRUE";
    expect(isAirgapped()).toBe(true);
    process.env.BLACKGLASS_AIRGAPPED = "1";
    expect(isAirgapped()).toBe(true);
    process.env.BLACKGLASS_AIRGAPPED = "yes";
    expect(isAirgapped()).toBe(true);
  });

  it("rejects ambiguous values", () => {
    process.env.BLACKGLASS_AIRGAPPED = "false";
    expect(isAirgapped()).toBe(false);
    process.env.BLACKGLASS_AIRGAPPED = "0";
    expect(isAirgapped()).toBe(false);
    process.env.BLACKGLASS_AIRGAPPED = "maybe";
    expect(isAirgapped()).toBe(false);
  });
});

describe("isInternalUrl", () => {
  it("matches RFC1918 + loopback + link-local", () => {
    expect(isInternalUrl("http://localhost:3000/x")).toBe(true);
    expect(isInternalUrl("http://127.0.0.1/x")).toBe(true);
    expect(isInternalUrl("http://10.0.5.7/x")).toBe(true);
    expect(isInternalUrl("http://192.168.1.1/x")).toBe(true);
    expect(isInternalUrl("http://172.16.0.1/x")).toBe(true);
    expect(isInternalUrl("http://172.31.255.255/x")).toBe(true);
    expect(isInternalUrl("http://169.254.169.254/x")).toBe(true);
  });

  it("matches *.internal / *.local / *.svc.cluster.local", () => {
    expect(isInternalUrl("https://otel.internal/v1/traces")).toBe(true);
    expect(isInternalUrl("https://printer.local/")).toBe(true);
    expect(isInternalUrl("https://web.blackglass.svc.cluster.local/")).toBe(true);
  });

  it("rejects public hostnames", () => {
    expect(isInternalUrl("https://hooks.slack.com/services/x")).toBe(false);
    expect(isInternalUrl("https://events.pagerduty.com/v2/enqueue")).toBe(false);
    expect(isInternalUrl("https://api.example.com/")).toBe(false);
  });

  it("rejects malformed URLs without throwing", () => {
    expect(isInternalUrl("not a url")).toBe(false);
    expect(isInternalUrl("")).toBe(false);
  });

  it("rejects 172.32+ which is outside RFC1918", () => {
    // 172.32.x.x is public — only 172.16-31 is private.
    expect(isInternalUrl("http://172.32.0.1/x")).toBe(false);
    expect(isInternalUrl("http://172.15.0.1/x")).toBe(false);
  });
});

describe("shouldSkipForAirgap", () => {
  it("returns false when not air-gapped", () => {
    expect(shouldSkipForAirgap("webhook", "https://hooks.slack.com/x")).toBe(false);
  });

  it("returns true for public URLs when air-gapped", () => {
    process.env.BLACKGLASS_AIRGAPPED = "true";
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(shouldSkipForAirgap("webhook", "https://hooks.slack.com/x")).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns false for internal URLs even when air-gapped", () => {
    process.env.BLACKGLASS_AIRGAPPED = "true";
    expect(shouldSkipForAirgap("webhook", "https://otel.internal/v1/traces")).toBe(false);
    expect(shouldSkipForAirgap("webhook", "http://10.0.0.5/")).toBe(false);
  });

  it("returns true with no URL when air-gapped (caller has no allow-list to honour)", () => {
    process.env.BLACKGLASS_AIRGAPPED = "true";
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(shouldSkipForAirgap("email")).toBe(true);
    spy.mockRestore();
  });
});

describe("airgapStatus", () => {
  it("returns null when not air-gapped", () => {
    expect(airgapStatus()).toBeNull();
  });

  it("returns the status object when air-gapped", () => {
    process.env.BLACKGLASS_AIRGAPPED = "true";
    const s = airgapStatus();
    expect(s).not.toBeNull();
    expect(s?.enabled).toBe(true);
    expect(s?.whitelistedHostPatterns.length).toBeGreaterThan(0);
  });
});
