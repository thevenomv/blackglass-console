/**
 * Onboarding telemetry helper.
 *
 * The unit-under-test is small but the behaviours we care about are
 * easy to break (log spam, missing field, wrong level), so we lock
 * them down here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetOnboardingTelemetryForTests,
  logOnboardingEvent,
  recordStageObservation,
} from "@/lib/server/onboarding/telemetry";

let infoSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  __resetOnboardingTelemetryForTests();
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  infoSpy.mockRestore();
  warnSpy.mockRestore();
});

function lastJsonLine(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const lastCall = spy.mock.calls.at(-1);
  if (!lastCall) throw new Error("no log line emitted");
  const [line] = lastCall as [string];
  return JSON.parse(line) as Record<string, unknown>;
}

describe("logOnboardingEvent", () => {
  it("emits an info-level structured line for ok outcomes", () => {
    logOnboardingEvent("onboarding.ingest_succeeded", {
      tenantId: "tenant-abc",
      hostId: "host-1-2-3-4",
      requestId: "req-xyz",
      outcome: "ok",
    });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    const line = lastJsonLine(infoSpy);
    expect(line.event).toBe("onboarding.ingest_succeeded");
    expect(line.tenant).toBe("tenant-abc");
    expect(line.host).toBe("host-1-2-3-4");
    expect(line.request_id).toBe("req-xyz");
    expect(line.outcome).toBe("ok");
    expect(line.level).toBe("info");
  });

  it("upgrades to warn for fail and blocked outcomes", () => {
    logOnboardingEvent("onboarding.ingest_blocked", {
      hostId: "host-1",
      outcome: "blocked",
      reason: "host_quota_exceeded",
    });
    logOnboardingEvent("onboarding.ssh_test_attempted", {
      hostId: "host-2",
      outcome: "fail",
      reason: "tcp timeout",
    });
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(infoSpy).not.toHaveBeenCalled();
    const blocked = JSON.parse(warnSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(blocked.level).toBe("warn");
    expect(blocked.reason).toBe("host_quota_exceeded");
  });

  it("flattens meta into the top-level structured payload", () => {
    logOnboardingEvent("onboarding.host_reset", {
      hostId: "host-1",
      outcome: "ok",
      meta: { tombstoneCleared: true, baselineRemoved: false, dropped: 7 },
    });
    const line = lastJsonLine(infoSpy);
    expect(line.tombstoneCleared).toBe(true);
    expect(line.baselineRemoved).toBe(false);
    expect(line.dropped).toBe(7);
  });
});

describe("recordStageObservation", () => {
  it("returns true on first observation and false on duplicates", () => {
    expect(recordStageObservation("t1", "host-a", "awaiting_first_push")).toBe(true);
    expect(recordStageObservation("t1", "host-a", "awaiting_first_push")).toBe(false);
    expect(recordStageObservation("t1", "host-a", "awaiting_first_push")).toBe(false);
  });

  it("returns true again when the stage actually transitions", () => {
    expect(recordStageObservation("t1", "host-a", "awaiting_first_push")).toBe(true);
    expect(recordStageObservation("t1", "host-a", "bundle_received")).toBe(true);
    expect(recordStageObservation("t1", "host-a", "bundle_received")).toBe(false);
    expect(recordStageObservation("t1", "host-a", "baseline_captured")).toBe(true);
  });

  it("treats different (tenant, host) pairs as independent buckets", () => {
    expect(recordStageObservation("t1", "host-a", "baseline_captured")).toBe(true);
    expect(recordStageObservation("t2", "host-a", "baseline_captured")).toBe(true);
    expect(recordStageObservation("t1", "host-b", "baseline_captured")).toBe(true);
    expect(recordStageObservation("t1", "host-a", "baseline_captured")).toBe(false);
  });

  it("treats null tenantId as a distinct namespace from any tenant id", () => {
    expect(recordStageObservation(null, "host-a", "awaiting_first_push")).toBe(true);
    expect(recordStageObservation("t1", "host-a", "awaiting_first_push")).toBe(true);
    expect(recordStageObservation(null, "host-a", "awaiting_first_push")).toBe(false);
  });
});
