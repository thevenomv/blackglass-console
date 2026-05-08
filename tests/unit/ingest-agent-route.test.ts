/**
 * Tests for /api/v1/ingest/agent — the push-mode replacement for the SSH
 * pull collector when BLACKGLASS can't reach the host (e.g. DO App Platform
 * → Droplet egress is blackholed by the DO network fabric).
 *
 * The contract this test pins down:
 *   - Bearer auth via INGEST_API_KEY (shared) OR INGEST_HOST_KEYS_JSON (per-host).
 *   - Raw `=BGS:<key>` bundle gets parsed by the SAME parsers the SSH
 *     collector uses, so the persisted HostSnapshot is byte-identical.
 *   - 503 when no auth secret is configured.
 *   - 401 on bad token.
 *   - First push for a host (no baseline yet) → bootstrap baseline,
 *     drift events cleared, audit BASELINE_CAPTURE.
 *   - Subsequent push (baseline exists) → does NOT overwrite baseline,
 *     runs the shared drift pipeline, audit SCAN_COMPLETED. This is the
 *     fix for the "agent push never produces drift" bug.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const saveBaselineMock = vi.hoisted(() => vi.fn(async () => {}));
const getBaselineMock = vi.hoisted(() => vi.fn(async () => undefined as unknown));
const listBaselineHostIdsMock = vi.hoisted(() => vi.fn(async () => [] as string[]));
const storeDriftEventsMock = vi.hoisted(() => vi.fn());
const processHostSnapshotDriftMock = vi.hoisted(() =>
  vi.fn(async () => ({ events: [] as unknown[], driftCount: 0, policyCount: 0 })),
);
const checkIngestRateMock = vi.hoisted(() => vi.fn(async () => true));
const appendAuditMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/baseline-store", () => ({
  saveBaseline: saveBaselineMock,
  getBaseline: getBaselineMock,
  listBaselineHostIds: listBaselineHostIdsMock,
}));
vi.mock("@/lib/server/drift-engine", () => ({
  storeDriftEvents: storeDriftEventsMock,
}));
vi.mock("@/lib/server/services/scan-drift-job", () => ({
  processHostSnapshotDrift: processHostSnapshotDriftMock,
}));
vi.mock("@/lib/server/rate-limit", () => ({
  checkIngestRate: checkIngestRateMock,
}));
vi.mock("@/lib/server/audit-log", () => ({
  appendAudit: appendAuditMock,
  AUDIT_ACTIONS: {
    BASELINE_CAPTURE: "baseline_capture",
    SCAN_COMPLETED: "scan_completed",
  },
}));
vi.mock("@/lib/server/integrity-revalidate", () => ({
  revalidateIntegritySurfaces: vi.fn(),
}));

const ORIGINAL_API_KEY = process.env.INGEST_API_KEY;
const ORIGINAL_HOST_KEYS = process.env.INGEST_HOST_KEYS_JSON;

beforeEach(() => {
  saveBaselineMock.mockReset();
  saveBaselineMock.mockResolvedValue(undefined);
  getBaselineMock.mockReset();
  getBaselineMock.mockResolvedValue(undefined);
  listBaselineHostIdsMock.mockReset();
  listBaselineHostIdsMock.mockResolvedValue([]);
  storeDriftEventsMock.mockReset();
  processHostSnapshotDriftMock.mockReset();
  processHostSnapshotDriftMock.mockResolvedValue({
    events: [],
    driftCount: 0,
    policyCount: 0,
  });
  checkIngestRateMock.mockReset();
  checkIngestRateMock.mockResolvedValue(true);
  appendAuditMock.mockReset();
  if (ORIGINAL_API_KEY === undefined) delete process.env.INGEST_API_KEY;
  else process.env.INGEST_API_KEY = ORIGINAL_API_KEY;
  if (ORIGINAL_HOST_KEYS === undefined) delete process.env.INGEST_HOST_KEYS_JSON;
  else process.env.INGEST_HOST_KEYS_JSON = ORIGINAL_HOST_KEYS;
});

const SAMPLE_BUNDLE = [
  "=BGS:ss",
  "LISTEN  0  128  0.0.0.0:22  0.0.0.0:* users:((\"sshd\",pid=1,fd=3))",
  "LISTEN  0  128  0.0.0.0:80  0.0.0.0:* users:((\"nginx\",pid=2,fd=6))",
  "=BGS:ssudp",
  "",
  "=BGS:passwd",
  "alice:1000",
  "bob:1001",
  "=BGS:sudo",
  "sudo:x:27:alice",
  "=BGS:sudofiles",
  "",
  "=BGS:cron",
  "logrotate",
  "=BGS:svc",
  "ssh.service              loaded  active  running  OpenBSD Secure Shell server",
  "=BGS:sshd",
  "permitrootlogin no",
  "passwordauthentication no",
  "=BGS:ufw",
  "Status: active",
  "Default: deny (incoming), allow (outgoing), disabled (routed)",
  "=BGS:authkeys",
  "alice:ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILastSixteenChars alice@host",
  "=BGS:filehashes",
  "deadbeef00000000  /etc/passwd",
  "=BGS:hosts",
  "127.0.0.1 localhost",
  "=BGS:lsmod",
  "br_netfilter",
  "=BGS:suid",
  "/usr/bin/sudo",
  "=BGS:usercron",
  "",
  "=BGS:pkgs",
  "ii  curl  7.81.0-1ubuntu1.20  amd64  command line tool for transferring data with URL syntax",
  "=BGS:systemdunits",
  "/etc/systemd/system/blackglass-agent.service",
  "/etc/systemd/system/blackglass-agent.timer",
].join("\n");

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    hostId: "host-127-0-0-1",
    hostname: "lab-test",
    collectedAt: new Date().toISOString(),
    bundle: SAMPLE_BUNDLE,
    ...overrides,
  };
}

async function call(
  body: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
): Promise<Response> {
  const { POST } = await import("../../src/app/api/v1/ingest/agent/route");
  return POST(
    new Request("http://localhost/api/v1/ingest/agent", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("/api/v1/ingest/agent", () => {
  it("returns 503 when neither INGEST_API_KEY nor INGEST_HOST_KEYS_JSON is configured", async () => {
    delete process.env.INGEST_API_KEY;
    delete process.env.INGEST_HOST_KEYS_JSON;
    const res = await call(makePayload(), {
      "content-type": "application/json",
      authorization: "Bearer anything",
    });
    expect(res.status).toBe(503);
  });

  it("returns 401 when the Bearer token does not match", async () => {
    process.env.INGEST_API_KEY = "correct-secret-1234567890";
    const res = await call(makePayload(), {
      "content-type": "application/json",
      authorization: "Bearer wrong-secret-aaaaaaaaa",
    });
    expect(res.status).toBe(401);
    expect(saveBaselineMock).not.toHaveBeenCalled();
  });

  it("first push for a host: bootstraps baseline, clears drift, audits BASELINE_CAPTURE", async () => {
    process.env.INGEST_API_KEY = "correct-secret-1234567890";
    getBaselineMock.mockResolvedValueOnce(undefined);
    const res = await call(makePayload(), {
      "content-type": "application/json",
      authorization: "Bearer correct-secret-1234567890",
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.hostId).toBe("host-127-0-0-1");
    expect(body.bootstrap).toBe(true);
    expect(body.driftEvents).toBe(0);
    expect(body.sections).toBeGreaterThanOrEqual(15);

    expect(saveBaselineMock).toHaveBeenCalledTimes(1);
    expect(storeDriftEventsMock).toHaveBeenCalledWith("host-127-0-0-1", []);
    expect(processHostSnapshotDriftMock).not.toHaveBeenCalled();

    const snapshot = (saveBaselineMock.mock.calls[0] as unknown as [unknown])[0] as {
      hostId: string;
      listeners: Array<{ port: number; process?: string }>;
      users: Array<{ username: string }>;
      ssh: { permitRootLogin: string; passwordAuthentication: string };
      firewall: { active: boolean };
    };
    expect(snapshot.hostId).toBe("host-127-0-0-1");
    expect(snapshot.listeners.some((l) => l.port === 22)).toBe(true);
    expect(snapshot.listeners.some((l) => l.port === 80)).toBe(true);
    expect(snapshot.users.map((u) => u.username).sort()).toEqual(["alice", "bob"]);
    expect(snapshot.ssh.permitRootLogin).toBe("no");
    expect(snapshot.ssh.passwordAuthentication).toBe("no");
    expect(snapshot.firewall.active).toBe(true);

    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    expect(appendAuditMock.mock.calls[0]?.[0]).toMatchObject({
      action: "baseline_capture",
    });
  });

  it("subsequent push: leaves baseline untouched, runs drift pipeline, audits SCAN_COMPLETED", async () => {
    process.env.INGEST_API_KEY = "correct-secret-1234567890";
    getBaselineMock.mockResolvedValueOnce({
      hostId: "host-127-0-0-1",
      hostname: "lab-test",
      collectedAt: "2026-05-01T00:00:00Z",
      listeners: [],
      users: [],
      sudoers: [],
      sudoersFiles: [],
      cronEntries: [],
      userCrontabs: [],
      services: [],
      ssh: { permitRootLogin: "no", passwordAuthentication: "no" },
      firewall: { active: true, rules: [] },
      authorizedKeys: [],
      fileHashes: [],
      hostsEntries: [],
      kernelModules: [],
      suidBinaries: [],
      installedPackages: [],
      systemdUnitFiles: [],
    });
    processHostSnapshotDriftMock.mockResolvedValueOnce({
      events: [
        { id: "e1", title: "new listener", severity: "high" },
        { id: "e2", title: "sudoers drift", severity: "medium" },
      ] as unknown[],
      driftCount: 2,
      policyCount: 0,
    });

    const res = await call(makePayload(), {
      "content-type": "application/json",
      authorization: "Bearer correct-secret-1234567890",
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.bootstrap).toBe(false);
    expect(body.driftEvents).toBe(2);

    // The fix: baseline must NOT be overwritten on a normal push.
    expect(saveBaselineMock).not.toHaveBeenCalled();
    // Drift pipeline must run.
    expect(processHostSnapshotDriftMock).toHaveBeenCalledTimes(1);
    const args = (processHostSnapshotDriftMock.mock.calls[0] as unknown as [
      {
        origin: string;
        jobId: string;
        snapshot: { hostId: string };
        baseline: { hostId: string };
      },
    ])[0];
    expect(args.origin).toBe("agent-push");
    expect(args.snapshot.hostId).toBe("host-127-0-0-1");
    expect(args.baseline.hostId).toBe("host-127-0-0-1");
    expect(args.jobId.startsWith("agent-host-127-0-0-1-")).toBe(true);

    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    expect(appendAuditMock.mock.calls[0]?.[0]).toMatchObject({
      action: "scan_completed",
    });
  });

  it("prefers per-host keys over the shared INGEST_API_KEY when configured", async () => {
    process.env.INGEST_API_KEY = "shared-secret-1234567890";
    process.env.INGEST_HOST_KEYS_JSON = JSON.stringify({
      "host-127-0-0-1": "per-host-secret-abcdef",
    });

    // Shared key MUST be rejected for a host that has its own key.
    const sharedRes = await call(makePayload(), {
      "content-type": "application/json",
      authorization: "Bearer shared-secret-1234567890",
    });
    expect(sharedRes.status).toBe(401);

    const perHostRes = await call(makePayload(), {
      "content-type": "application/json",
      authorization: "Bearer per-host-secret-abcdef",
    });
    expect(perHostRes.status).toBe(200);
  });

  it("returns 429 when the per-host rate limiter rejects", async () => {
    process.env.INGEST_API_KEY = "correct-secret-1234567890";
    checkIngestRateMock.mockResolvedValueOnce(false);
    const res = await call(makePayload(), {
      "content-type": "application/json",
      authorization: "Bearer correct-secret-1234567890",
    });
    expect(res.status).toBe(429);
  });

  it("rejects malformed payloads with 400", async () => {
    process.env.INGEST_API_KEY = "correct-secret-1234567890";
    const res = await call(
      { hostId: "x", hostname: "y" /* missing bundle + collectedAt */ },
      {
        "content-type": "application/json",
        authorization: "Bearer correct-secret-1234567890",
      },
    );
    expect(res.status).toBe(400);
  });
});
