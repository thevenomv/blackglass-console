/**
 * Behaviour we care about for src/lib/server/agent-wake.ts:
 *
 *  1. requestWake + consumeWake round-trip works in the in-memory
 *     fallback path (no REDIS_QUEUE_URL).
 *  2. consumeWake is atomic — calling it twice in a row only returns
 *     true once, even when the flag was set just before the first call.
 *  3. Flags expire after AGENT_WAKE_TTL_SECS — a stale flag can't
 *     keep waking the agent forever.
 *
 * Redis paths are intentionally NOT exercised here — the multi-
 * instance test in scan-jobs already covers the ioredis mock surface.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetWakeForTests } from "@/lib/server/agent-wake";

describe("agent-wake (memory fallback)", () => {
  beforeEach(() => {
    delete process.env.REDIS_QUEUE_URL;
    // Note: AGENT_WAKE_TTL_SECS is read once at module-load time, so
    // setting it here has no effect on an already-imported module.
    // The test below advances past the production default (300s)
    // instead of trying to override the env per-test.
    _resetWakeForTests();
  });

  afterEach(() => {
    _resetWakeForTests();
    vi.useRealTimers();
  });

  it("requestWake then consumeWake returns true", async () => {
    const { requestWake, consumeWake } = await import("@/lib/server/agent-wake");
    const storage = await requestWake("host-1");
    expect(storage).toBe("memory");
    expect(await consumeWake("host-1")).toBe(true);
  });

  it("consumeWake is one-shot — second call returns false", async () => {
    const { requestWake, consumeWake } = await import("@/lib/server/agent-wake");
    await requestWake("host-2");
    expect(await consumeWake("host-2")).toBe(true);
    expect(await consumeWake("host-2")).toBe(false);
  });

  it("flags are scoped per host", async () => {
    const { requestWake, consumeWake } = await import("@/lib/server/agent-wake");
    await requestWake("host-A");
    expect(await consumeWake("host-B")).toBe(false);
    expect(await consumeWake("host-A")).toBe(true);
  });

  it("flags expire after the TTL window elapses", async () => {
    // Install fake timers FIRST and pin the system time so both
    // requestWake (writes expiresAt) and consumeWake (reads it)
    // observe the same simulated clock. Without `setSystemTime`
    // Date.now() can fall through to the real clock depending on
    // Vitest version.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { requestWake, consumeWake } = await import("@/lib/server/agent-wake");
    await requestWake("host-3");
    // Advance past the production default TTL (300s). +1s buffer so
    // we don't fight the Date.now() >= expiresAt equality.
    vi.setSystemTime(new Date("2026-01-01T00:05:01Z"));
    expect(await consumeWake("host-3")).toBe(false);
  });
});
