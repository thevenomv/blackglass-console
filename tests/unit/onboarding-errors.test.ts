/**
 * Tests for src/lib/server/onboarding/errors.ts and parity with the
 * client-side troubleshooting tip catalogue.
 *
 * Why parity matters: the wizard's troubleshooting block reads from
 * `src/lib/onboarding/troubleshooting.ts` because we can't import the
 * server module from a client component. This test asserts that every
 * server code with user-facing impact (4xx/5xx) has a matching tip on
 * the client side, so a new error code never lands in production
 * without a remedy in the wizard.
 */

import { describe, it, expect } from "vitest";
import {
  onboardingError,
  onboardingRemedy,
  allOnboardingCodes,
  type OnboardingErrorCode,
} from "@/lib/server/onboarding/errors";
import { ONBOARDING_TIPS, tipForCode } from "@/lib/onboarding/troubleshooting";

describe("onboardingError", () => {
  it.each<OnboardingErrorCode>([
    "unauthorized",
    "host_quota_exceeded",
    "host_tombstoned",
    "rate_limited",
    "bundle_truncated",
    "bundle_missing_sections",
    "parse_failed",
    "drift_pipeline_failed",
    "ingest_not_configured",
    "ingest_scope_invalid",
    "database_unavailable",
    "validation_failed",
  ])("returns a fully-formed error for %s", (code) => {
    const e = onboardingError(code, "test detail");
    expect(e.code).toBe(code);
    expect(e.detail).toBe("test detail");
    expect(e.remedy).toBeTruthy();
    expect(e.remedy.length).toBeGreaterThan(20);
    expect(e.status).toBeGreaterThanOrEqual(400);
    expect(e.status).toBeLessThan(600);
  });

  it("uses the correct HTTP status for each code", () => {
    expect(onboardingError("unauthorized", "x").status).toBe(401);
    expect(onboardingError("host_quota_exceeded", "x").status).toBe(403);
    expect(onboardingError("host_tombstoned", "x").status).toBe(410);
    expect(onboardingError("rate_limited", "x").status).toBe(429);
    expect(onboardingError("bundle_truncated", "x").status).toBe(422);
    expect(onboardingError("drift_pipeline_failed", "x").status).toBe(502);
    expect(onboardingError("ingest_not_configured", "x").status).toBe(503);
  });
});

describe("onboardingRemedy", () => {
  it("returns the same remedy as onboardingError().remedy", () => {
    const e = onboardingError("host_tombstoned", "x");
    expect(onboardingRemedy("host_tombstoned")).toBe(e.remedy);
  });
});

describe("client/server tip parity", () => {
  // The codes the wizard surfaces to end users. `validation_failed`,
  // `ingest_scope_invalid`, and `database_unavailable` are operator-only
  // and don't need a wizard tip.
  const userFacingCodes: OnboardingErrorCode[] = [
    "unauthorized",
    "host_quota_exceeded",
    "host_tombstoned",
    "rate_limited",
    "bundle_truncated",
    "bundle_missing_sections",
    "parse_failed",
    "drift_pipeline_failed",
    "ingest_not_configured",
  ];

  it.each(userFacingCodes)("client tip exists for %s", (code) => {
    const tip = tipForCode(code);
    expect(tip).toBeDefined();
    expect(tip?.title).toBeTruthy();
    expect(tip?.remedy).toBeTruthy();
  });

  it("every client tip has a server code (no orphan tips)", () => {
    const serverCodes = new Set<string>(allOnboardingCodes());
    for (const tip of ONBOARDING_TIPS) {
      expect(serverCodes.has(tip.code)).toBe(true);
    }
  });
});
