import { describe, expect, it } from "vitest";
import {
  AuditEventsQuerySchema,
  AuditPostBodySchema,
  DriftQuerySchema,
  ResourceIdPathSchema,
  IngestPayloadSchema,
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

// Minimal valid IngestPayload fixture
const validIngest = {
  hostId: "host-10-0-0-1",
  hostname: "prod-server-01.example.com",
  collectedAt: "2026-05-03T12:00:00.000Z",
  listeners: [{ proto: "tcp", bind: "0.0.0.0", port: 22, process: "sshd" }],
  users: [{ username: "ubuntu", uid: 1000 }],
  sudoers: ["ubuntu ALL=(ALL) NOPASSWD:ALL"],
  cronEntries: [{ filename: "/etc/cron.d/cleanup" }],
  services: [{ unit: "ssh.service", sub: "running" }],
  ssh: { permitRootLogin: "no", passwordAuthentication: "no" },
  firewall: { active: true, defaultInbound: "DROP", rules: [] },
};

describe("IngestPayloadSchema", () => {
  it("accepts a well-formed payload", () => {
    const r = IngestPayloadSchema.safeParse(validIngest);
    expect(r.success).toBe(true);
  });

  it("rejects path traversal in hostId", () => {
    const r = IngestPayloadSchema.safeParse({ ...validIngest, hostId: "../../etc/passwd" });
    expect(r.success).toBe(false);
  });

  it("rejects hostId with spaces", () => {
    const r = IngestPayloadSchema.safeParse({ ...validIngest, hostId: "host 1" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid datetime in collectedAt", () => {
    const r = IngestPayloadSchema.safeParse({ ...validIngest, collectedAt: "not-a-date" });
    expect(r.success).toBe(false);
  });

  it("rejects port out of range", () => {
    const r = IngestPayloadSchema.safeParse({
      ...validIngest,
      listeners: [{ proto: "tcp", bind: "0.0.0.0", port: 99999, process: "sshd" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid proto", () => {
    const r = IngestPayloadSchema.safeParse({
      ...validIngest,
      listeners: [{ proto: "sctp", bind: "0.0.0.0", port: 22 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects too many listeners (over 4096)", () => {
    const listeners = Array.from({ length: 4097 }, (_, i) => ({
      proto: "tcp" as const, bind: "127.0.0.1", port: i % 65535,
    }));
    const r = IngestPayloadSchema.safeParse({ ...validIngest, listeners });
    expect(r.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { hostname: _h, ...withoutHostname } = validIngest;
    expect(IngestPayloadSchema.safeParse(withoutHostname).success).toBe(false);
  });

  it("rejects an empty object", () => {
    expect(IngestPayloadSchema.safeParse({}).success).toBe(false);
  });
});
