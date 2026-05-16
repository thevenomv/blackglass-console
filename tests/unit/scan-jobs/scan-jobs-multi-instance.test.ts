/**
 * Cross-instance correctness for src/lib/server/scan-jobs.ts.
 *
 * These tests prove the merge logic in `getScanRecordWithFallback`
 * picks the freshest copy when local Map and Redis disagree —
 * critical for the (DO App Platform multi-instance) case where the
 * BullMQ worker resolves a scan in process A and the poll route
 * runs in process B with a stale local cache.
 *
 * The Redis client is mocked at the module boundary so the test
 * doesn't need a live Redis instance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redisStore = new Map<string, string>();

vi.mock("ioredis", () => {
  // Minimal subset of the ioredis interface that scan-jobs.ts touches.
  class FakeRedis {
    constructor(_url?: string, _opts?: unknown) {
      void _url;
      void _opts;
    }
    on(_ev: string, _fn: (...args: unknown[]) => void) {
      void _ev;
      void _fn;
    }
    async set(key: string, value: string, _mode?: string, _ttl?: number) {
      void _mode;
      void _ttl;
      redisStore.set(key, value);
      return "OK";
    }
    async get(key: string) {
      return redisStore.get(key) ?? null;
    }
    async del(key: string) {
      const had = redisStore.delete(key);
      return had ? 1 : 0;
    }
    disconnect() {}
  }
  return { default: FakeRedis };
});

describe("scan-jobs multi-instance merge", () => {
  beforeEach(() => {
    process.env.REDIS_QUEUE_URL = "redis://test-instance/0";
    redisStore.clear();
    // Force re-import so module-level singletons (Redis client, jobs Map)
    // start clean for each test.
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.REDIS_QUEUE_URL;
    redisStore.clear();
    vi.resetModules();
  });

  it("publishes enqueue + markScanReal + progress + resolve to Redis", async () => {
    const { enqueueScan, markScanReal, updateScanProgress, resolveScan } = await import(
      "@/lib/server/scan-jobs"
    );
    const job = enqueueScan(["host-1"]);
    // Wait one microtask for the fire-and-forget publish to land.
    await new Promise((r) => setTimeout(r, 10));
    expect(redisStore.has(`bg:scan:${job.id}`)).toBe(true);

    markScanReal(job.id);
    updateScanProgress(job.id, "Waiting for fresh agent snapshot…");
    resolveScan(job.id, "succeeded", "done", 3);
    await new Promise((r) => setTimeout(r, 10));

    const stored = JSON.parse(redisStore.get(`bg:scan:${job.id}`)!);
    expect(stored.kind).toBe("real");
    expect(stored.resolvedStatus).toBe("succeeded");
    expect(stored.driftCount).toBe(3);
    expect(stored.updatedAt).toBeGreaterThan(0);
  });

  it("getScanRecordWithFallback prefers Redis when its updatedAt is newer", async () => {
    const { enqueueScan, getScanRecordWithFallback, getScanRecord } = await import(
      "@/lib/server/scan-jobs"
    );
    const job = enqueueScan(["host-2"]);
    // Hand-craft a "newer" Redis copy that simulates an update from a
    // different web instance / the BullMQ worker.
    const newer = {
      ...job,
      kind: "real",
      progressDetail: "Computing drift on instance B…",
      updatedAt: Date.now() + 5_000,
    };
    redisStore.set(`bg:scan:${job.id}`, JSON.stringify(newer));

    const merged = await getScanRecordWithFallback(job.id);
    expect(merged?.kind).toBe("real");
    expect(merged?.progressDetail).toBe("Computing drift on instance B…");
    // Local Map should also be updated so subsequent sync reads agree.
    expect(getScanRecord(job.id)?.progressDetail).toBe("Computing drift on instance B…");
  });

  it("getScanRecordWithFallback prefers a record with resolvedStatus over an in-flight one", async () => {
    const { enqueueScan, getScanRecordWithFallback } = await import(
      "@/lib/server/scan-jobs"
    );
    const job = enqueueScan(["host-3"]);
    // Simulate: local copy is older "in-flight"; Redis has a terminal
    // record with EARLIER updatedAt (race where the worker's resolve
    // landed in Redis before the local progressUpdate fire-and-forget).
    // Terminal status MUST still win.
    const terminal = {
      ...job,
      kind: "real",
      resolvedStatus: "succeeded",
      resolvedDetail: "all good",
      driftCount: 1,
      updatedAt: (job.updatedAt ?? Date.now()) - 1_000,
    };
    redisStore.set(`bg:scan:${job.id}`, JSON.stringify(terminal));

    const merged = await getScanRecordWithFallback(job.id);
    expect(merged?.resolvedStatus).toBe("succeeded");
    expect(merged?.driftCount).toBe(1);
  });

  it("getScanRecordWithFallback returns the local copy when Redis has nothing", async () => {
    const { enqueueScan, getScanRecordWithFallback } = await import(
      "@/lib/server/scan-jobs"
    );
    const job = enqueueScan(["host-4"]);
    redisStore.clear(); // Pretend Redis lost its key (TTL eviction).
    const merged = await getScanRecordWithFallback(job.id);
    expect(merged?.id).toBe(job.id);
  });

  it("returns the Redis copy even when the local instance never enqueued the scan", async () => {
    // This is the "poll routes to a different web instance" scenario.
    // The web instance B that handles the poll has no local record at
    // all — only Redis knows about it.
    const { getScanRecordWithFallback } = await import("@/lib/server/scan-jobs");
    const synthetic = {
      id: "scan-from-other-instance",
      createdAt: Date.now() - 4_000,
      hostIds: ["host-5"],
      kind: "real",
      progressDetail: "Collecting on instance A…",
      updatedAt: Date.now(),
    };
    redisStore.set(`bg:scan:${synthetic.id}`, JSON.stringify(synthetic));

    const merged = await getScanRecordWithFallback(synthetic.id);
    expect(merged?.kind).toBe("real");
    expect(merged?.hostIds).toEqual(["host-5"]);
  });
});
