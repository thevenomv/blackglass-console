/**
 * Unit tests for the Sentry → PagerDuty bridge helpers.
 *
 * The bridge does network I/O against PagerDuty's events API; we test the
 * pure decision functions exposed via __internals so we can validate
 * filtering + fingerprinting without HTTP.
 */

import { afterEach, describe, expect, it } from "vitest";
import { __internals } from "@/lib/server/sentry-pagerduty";

const { bridgeEnabled, shouldTrigger, fingerprintFromEvent, severityFromLevel } = __internals;

const ENV_KEYS = [
  "PD_SENTRY_BRIDGE_ENABLED",
  "PD_SENTRY_MIN_LEVEL",
] as const;

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("sentry-pagerduty bridge", () => {
  it("bridgeEnabled is false by default", () => {
    expect(bridgeEnabled()).toBe(false);
  });

  it("bridgeEnabled accepts true / 1 / yes", () => {
    process.env.PD_SENTRY_BRIDGE_ENABLED = "true";
    expect(bridgeEnabled()).toBe(true);
    process.env.PD_SENTRY_BRIDGE_ENABLED = "1";
    expect(bridgeEnabled()).toBe(true);
    process.env.PD_SENTRY_BRIDGE_ENABLED = "yes";
    expect(bridgeEnabled()).toBe(true);
  });

  it("shouldTrigger respects min-level=error by default", () => {
    expect(shouldTrigger("error")).toBe(true);
    expect(shouldTrigger("fatal")).toBe(true);
    expect(shouldTrigger("warning")).toBe(false);
    expect(shouldTrigger("info")).toBe(false);
    expect(shouldTrigger(undefined)).toBe(false);
  });

  it("shouldTrigger min-level=fatal only triggers on fatal", () => {
    process.env.PD_SENTRY_MIN_LEVEL = "fatal";
    expect(shouldTrigger("fatal")).toBe(true);
    expect(shouldTrigger("error")).toBe(false);
    expect(shouldTrigger("warning")).toBe(false);
  });

  it("fingerprintFromEvent prefers the explicit fingerprint", () => {
    const fp = fingerprintFromEvent({ fingerprint: ["a", "b"] });
    expect(fp).toMatch(/^[0-9a-f]{24}$/);
    // Stable across calls
    expect(fingerprintFromEvent({ fingerprint: ["a", "b"] })).toBe(fp);
    // Different fingerprint → different hash
    expect(fingerprintFromEvent({ fingerprint: ["a", "c"] })).not.toBe(fp);
  });

  it("fingerprintFromEvent falls back to exception type+value", () => {
    const fp = fingerprintFromEvent({
      exception: { values: [{ type: "TypeError", value: "x is undefined" }] },
    });
    expect(fp).toMatch(/^[0-9a-f]{24}$/);
    expect(
      fingerprintFromEvent({
        exception: { values: [{ type: "TypeError", value: "x is undefined" }] },
      }),
    ).toBe(fp);
  });

  it("fingerprintFromEvent falls back to message when no exception", () => {
    const fp = fingerprintFromEvent({ message: "boom" });
    expect(fp).toMatch(/^[0-9a-f]{24}$/);
    expect(fingerprintFromEvent({ message: "boom" })).toBe(fp);
    expect(fingerprintFromEvent({ message: "boom2" })).not.toBe(fp);
  });

  it("severityFromLevel maps Sentry levels to PagerDuty severities", () => {
    expect(severityFromLevel("fatal")).toBe("critical");
    expect(severityFromLevel("error")).toBe("error");
    expect(severityFromLevel("warning")).toBe("warning");
    expect(severityFromLevel("info")).toBe("info");
    expect(severityFromLevel(undefined)).toBe("info");
  });
});
