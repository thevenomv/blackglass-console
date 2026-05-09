/**
 * Tests for GET /install-agent.sh — the dynamic installer template.
 *
 * Pin down:
 *   - Returns text/x-shellscript with no-store cache headers
 *   - Embeds the canonical agent script content
 *   - Bakes the request host into the BLACKGLASS_INGEST_URL default
 *   - Auto-clears tombstones on hits within the retry window
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const isHostTombstonedMock = vi.hoisted(() =>
  vi.fn(async () => null as unknown),
);
const clearTombstoneMock = vi.hoisted(() => vi.fn(async () => true));
const appendAuditMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/host-tombstones", () => ({
  isHostTombstoned: isHostTombstonedMock,
  clearTombstone: clearTombstoneMock,
}));
vi.mock("@/lib/server/audit-log", () => ({
  appendAudit: appendAuditMock,
  AUDIT_ACTIONS: { HOST_DELETED: "host_deleted" },
}));

beforeEach(() => {
  isHostTombstonedMock.mockReset().mockResolvedValue(null);
  clearTombstoneMock.mockReset().mockResolvedValue(true);
  appendAuditMock.mockReset();
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.HOST_TOMBSTONE_TTL_HOURS;
  delete process.env.INGEST_SAAS_TENANT_ID;
});

async function call(host = "blackglasssec.com", query = ""): Promise<Response> {
  const { GET } = await import("../../src/app/install-agent.sh/route");
  return GET(
    new Request(`http://${host}/install-agent.sh${query}`, {
      headers: { host },
    }),
  );
}

describe("GET /install-agent.sh", () => {
  it("returns a shell script with no-store cache headers", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/x-shellscript/);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("bakes the request host into the default ingest URL", async () => {
    const res = await call("custom-console.example.org");
    const body = await res.text();
    expect(body).toContain(
      "INGEST_URL_DEFAULT=\"https://custom-console.example.org/api/v1/ingest/agent\"",
    );
    expect(body).toContain("CONSOLE_URL=\"https://custom-console.example.org\"");
  });

  it("embeds the canonical agent script", async () => {
    const res = await call();
    const body = await res.text();
    // The bundle delimiter only appears in scripts/blackglass-agent.sh.
    expect(body).toContain("=BGS:");
    // The blackglass user creation logic is part of the installer template.
    expect(body).toContain("useradd --system");
  });

  it("requires BLACKGLASS_KEY and runs as root", async () => {
    const res = await call();
    const body = await res.text();
    expect(body).toContain("BLACKGLASS_KEY env var is required");
    expect(body).toContain("Run as root");
  });

  it("auto-clears a fresh tombstone for the requested host", async () => {
    isHostTombstonedMock.mockResolvedValueOnce({
      hostId: "host-1-2-3-4",
      tenantId: null,
      hostname: null,
      deletedBy: null,
      // Created 2 minutes ago, default TTL 24h → expires 24h - 2min from now.
      expiresAt: new Date(
        Date.now() + 24 * 60 * 60 * 1000 - 2 * 60 * 1000,
      ).toISOString(),
    });

    const res = await call("blackglasssec.com", "?host=host-1-2-3-4");
    expect(res.status).toBe(200);
    expect(clearTombstoneMock).toHaveBeenCalledWith("host-1-2-3-4", null);
    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    expect(appendAuditMock.mock.calls[0]?.[0]).toMatchObject({
      detail: expect.stringContaining("tombstone_auto_cleared"),
    });
  });

  it("does NOT auto-clear an old tombstone outside the retry window", async () => {
    isHostTombstonedMock.mockResolvedValueOnce({
      hostId: "host-1-2-3-4",
      tenantId: null,
      hostname: null,
      deletedBy: null,
      // Created 60 minutes ago → way outside the 10-minute window.
      expiresAt: new Date(
        Date.now() + 24 * 60 * 60 * 1000 - 60 * 60 * 1000,
      ).toISOString(),
    });

    const res = await call("blackglasssec.com", "?host=host-1-2-3-4");
    expect(res.status).toBe(200);
    expect(clearTombstoneMock).not.toHaveBeenCalled();
    expect(appendAuditMock).not.toHaveBeenCalled();
  });

  it("normalises the host query param before tombstone lookup", async () => {
    isHostTombstonedMock.mockResolvedValueOnce(null);
    await call("blackglasssec.com", "?host=Production.Web.01");
    // Should have been normalised to host-production-web-01 before the
    // tombstone lookup ran.
    expect(isHostTombstonedMock).toHaveBeenCalledWith(
      "host-production-web-01",
      null,
    );
  });
});
