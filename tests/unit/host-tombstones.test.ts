/**
 * Tests for src/lib/server/host-tombstones.ts (in-memory path only).
 *
 * The Postgres path is exercised by integration tests when DATABASE_URL
 * is available; here we pin down the semantics every caller relies on:
 *   - createTombstone returns the expiry it computed.
 *   - isHostTombstoned honours the TTL and returns null after expiry.
 *   - tenant scoping is independent (NULL-tenant != some-tenant).
 *   - clearTombstone is idempotent.
 *   - getTombstoneTtlHours respects HOST_TOMBSTONE_TTL_HOURS.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createTombstone,
  isHostTombstoned,
  clearTombstone,
  getTombstoneTtlHours,
  _resetMemTombstonesForTest,
} from "@/lib/server/host-tombstones";

const ORIGINAL_TTL = process.env.HOST_TOMBSTONE_TTL_HOURS;
const ORIGINAL_DB = process.env.DATABASE_URL;

beforeEach(() => {
  // Force the no-DB path so we exercise the in-memory branch deterministically.
  delete process.env.DATABASE_URL;
  delete process.env.HOST_TOMBSTONE_TTL_HOURS;
  _resetMemTombstonesForTest();
});

afterEach(() => {
  if (ORIGINAL_TTL === undefined) delete process.env.HOST_TOMBSTONE_TTL_HOURS;
  else process.env.HOST_TOMBSTONE_TTL_HOURS = ORIGINAL_TTL;
  if (ORIGINAL_DB === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DB;
  vi.useRealTimers();
});

describe("getTombstoneTtlHours", () => {
  it("defaults to 24h", () => {
    expect(getTombstoneTtlHours()).toBe(24);
  });

  it("honours valid env override", () => {
    process.env.HOST_TOMBSTONE_TTL_HOURS = "48";
    expect(getTombstoneTtlHours()).toBe(48);
  });

  it("falls back to default on garbage values", () => {
    process.env.HOST_TOMBSTONE_TTL_HOURS = "not-a-number";
    expect(getTombstoneTtlHours()).toBe(24);
  });

  it("floors at 1h (zero / negative makes no sense for a guard)", () => {
    process.env.HOST_TOMBSTONE_TTL_HOURS = "0";
    expect(getTombstoneTtlHours()).toBe(24);
    process.env.HOST_TOMBSTONE_TTL_HOURS = "-5";
    expect(getTombstoneTtlHours()).toBe(24);
  });

  it("caps at 1 year (anything more is an allowlist policy decision)", () => {
    process.env.HOST_TOMBSTONE_TTL_HOURS = "999999";
    expect(getTombstoneTtlHours()).toBe(24 * 365);
  });
});

describe("createTombstone + isHostTombstoned", () => {
  it("blocks the same hostId immediately after a delete", async () => {
    const t = await createTombstone({
      hostId: "host-1-2-3-4",
      tenantId: null,
      hostname: "demo.example.com",
      deletedBy: "user-x",
    });
    expect(t.expiresAt).toBeTruthy();

    const hit = await isHostTombstoned("host-1-2-3-4", null);
    expect(hit).not.toBeNull();
    expect(hit?.hostname).toBe("demo.example.com");
    expect(hit?.deletedBy).toBe("user-x");
  });

  it("returns null after the TTL expires", async () => {
    process.env.HOST_TOMBSTONE_TTL_HOURS = "1";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-09T12:00:00Z"));

    await createTombstone({
      hostId: "host-1-2-3-4",
      tenantId: null,
      hostname: null,
      deletedBy: null,
    });

    // Inside the window — still tombstoned.
    vi.setSystemTime(new Date("2026-05-09T12:30:00Z"));
    expect(await isHostTombstoned("host-1-2-3-4", null)).not.toBeNull();

    // After the window — gone.
    vi.setSystemTime(new Date("2026-05-09T13:30:00Z"));
    expect(await isHostTombstoned("host-1-2-3-4", null)).toBeNull();
  });

  it("scopes by tenant_id — a tenant-A tombstone does NOT block tenant-B", async () => {
    await createTombstone({
      hostId: "host-shared",
      tenantId: "tenant-a-uuid",
      hostname: null,
      deletedBy: null,
    });

    expect(await isHostTombstoned("host-shared", "tenant-a-uuid")).not.toBeNull();
    expect(await isHostTombstoned("host-shared", "tenant-b-uuid")).toBeNull();
    // The legacy / null-tenant scope is also independent.
    expect(await isHostTombstoned("host-shared", null)).toBeNull();
  });

  it("does not bleed between hostIds", async () => {
    await createTombstone({
      hostId: "host-a",
      tenantId: null,
      hostname: null,
      deletedBy: null,
    });
    expect(await isHostTombstoned("host-a", null)).not.toBeNull();
    expect(await isHostTombstoned("host-b", null)).toBeNull();
  });

  it("a re-delete extends the TTL (never shortens it)", async () => {
    process.env.HOST_TOMBSTONE_TTL_HOURS = "1";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-09T12:00:00Z"));

    await createTombstone({
      hostId: "host-x",
      tenantId: null,
      hostname: null,
      deletedBy: null,
    });

    // Half an hour later, re-delete; TTL window restarts.
    vi.setSystemTime(new Date("2026-05-09T12:30:00Z"));
    await createTombstone({
      hostId: "host-x",
      tenantId: null,
      hostname: null,
      deletedBy: null,
    });

    // 70min after the *first* delete — would be expired without the
    // refresh, but should still be live because of the second delete.
    vi.setSystemTime(new Date("2026-05-09T13:10:00Z"));
    expect(await isHostTombstoned("host-x", null)).not.toBeNull();
  });
});

describe("clearTombstone", () => {
  it("removes a live tombstone and is idempotent", async () => {
    await createTombstone({
      hostId: "host-1-2-3-4",
      tenantId: null,
      hostname: null,
      deletedBy: null,
    });
    expect(await isHostTombstoned("host-1-2-3-4", null)).not.toBeNull();

    expect(await clearTombstone("host-1-2-3-4", null)).toBe(true);
    expect(await isHostTombstoned("host-1-2-3-4", null)).toBeNull();

    // Second clear is a no-op.
    expect(await clearTombstone("host-1-2-3-4", null)).toBe(false);
  });
});
