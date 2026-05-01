import { describe, expect, it } from "vitest";
import {
  AuditEventsQuerySchema,
  AuditPostBodySchema,
  DriftQuerySchema,
  ResourceIdPathSchema,
} from "@/lib/server/http/schemas";

describe("AuditPostBodySchema", () => {
  it("accepts optional scan_id", () => {
    const r = AuditPostBodySchema.parse({
      action: "note",
      detail: "hello",
      scan_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(r.scan_id).toContain("550e8400");
  });
});

describe("AuditEventsQuerySchema", () => {
  it("defaults limit to 80 when param absent", () => {
    expect(AuditEventsQuerySchema.parse({ limit: null }).limit).toBe(80);
  });

  it("accepts boundary limits", () => {
    expect(AuditEventsQuerySchema.parse({ limit: "1" }).limit).toBe(1);
    expect(AuditEventsQuerySchema.parse({ limit: "200" }).limit).toBe(200);
  });

  it("rejects out-of-range limit", () => {
    expect(AuditEventsQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(AuditEventsQuerySchema.safeParse({ limit: "201" }).success).toBe(false);
    expect(AuditEventsQuerySchema.safeParse({ limit: "nope" }).success).toBe(false);
  });
});

describe("DriftQuerySchema", () => {
  it("omits filters when empty strings", () => {
    const r = DriftQuerySchema.parse({ hostId: "", lifecycle: "" });
    expect(r.hostId).toBeUndefined();
    expect(r.lifecycle).toBeUndefined();
  });

  it("accepts valid lifecycle", () => {
    expect(
      DriftQuerySchema.parse({ hostId: null, lifecycle: "new" }).lifecycle,
    ).toBe("new");
  });

  it("rejects invalid lifecycle", () => {
    expect(
      DriftQuerySchema.safeParse({ hostId: null, lifecycle: "unknown" }).success,
    ).toBe(false);
  });
});

describe("ResourceIdPathSchema", () => {
  it("accepts uuids and bundle slugs", () => {
    expect(ResourceIdPathSchema.parse("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBeTruthy();
    expect(ResourceIdPathSchema.parse("bundle-production-weekly")).toBeTruthy();
    expect(ResourceIdPathSchema.parse("scan-1715000000000")).toBeTruthy();
  });

  it("rejects path traversal-ish ids", () => {
    expect(ResourceIdPathSchema.safeParse("../../etc/passwd").success).toBe(false);
    expect(ResourceIdPathSchema.safeParse("bad id").success).toBe(false);
  });
});
