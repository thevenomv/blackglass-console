/**
 * Smoke tests for /api/admin/lab-health.
 *
 * Mocks the auth gate and runs a real TCP probe against a Node.js TCP
 * server we spin up on an ephemeral port — that exercises the actual
 * banner-read / timeout / "TCP open but no banner" code paths without
 * depending on a real demo VM being reachable from CI.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:net";
import { AddressInfo } from "node:net";

vi.mock("@/lib/server/http/saas-access", () => ({
  requireSaasOrLegacyPermission: vi.fn(async () => ({ ok: true })),
}));

// Mocked baseline store — tests opt in to "agent has reported recently"
// or "no agent ever" by tweaking the resolved value before each test.
const baselineMock = vi.hoisted(() => ({
  getBaseline: vi.fn<(hostId: string) => Promise<unknown>>(async () => undefined),
}));
vi.mock("@/lib/server/baseline-store", () => baselineMock);

let server: Server | null = null;
let port = 0;
const ORIGINAL_HOST = process.env.COLLECTOR_HOST_1;
const ORIGINAL_PORT = process.env.COLLECTOR_PORT;
const ORIGINAL_NAME = process.env.COLLECTOR_HOST_1_NAME;

async function startServer(behaviour: "ssh-banner" | "no-banner"): Promise<void> {
  server = createServer((sock) => {
    if (behaviour === "ssh-banner") {
      sock.write("SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.15\r\n");
    }
    // Otherwise leave the connection open with no data — that's the
    // "TCP open but sshd not responding" signal we want to detect.
    sock.on("error", () => sock.destroy());
  });
  await new Promise<void>((resolve) => {
    server!.listen(0, "127.0.0.1", () => {
      const addr = server!.address() as AddressInfo;
      port = addr.port;
      resolve();
    });
  });
}

async function stopServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
}

beforeEach(() => {
  delete process.env.COLLECTOR_HOST_1;
  delete process.env.COLLECTOR_PORT;
  delete process.env.COLLECTOR_HOST_1_NAME;
  delete process.env.LAB_AGENT_HOST_ID;
  delete process.env.LAB_AGENT_FRESH_WINDOW_SECONDS;
  baselineMock.getBaseline.mockReset();
  baselineMock.getBaseline.mockResolvedValue(undefined);
});
afterEach(async () => {
  await stopServer();
  if (ORIGINAL_HOST === undefined) delete process.env.COLLECTOR_HOST_1;
  else process.env.COLLECTOR_HOST_1 = ORIGINAL_HOST;
  if (ORIGINAL_PORT === undefined) delete process.env.COLLECTOR_PORT;
  else process.env.COLLECTOR_PORT = ORIGINAL_PORT;
  if (ORIGINAL_NAME === undefined) delete process.env.COLLECTOR_HOST_1_NAME;
  else process.env.COLLECTOR_HOST_1_NAME = ORIGINAL_NAME;
});

type LabHealthBody = {
  configured: boolean;
  tcpReachable: boolean;
  bannerLooksHealthy: boolean;
  sshBanner: string | null;
  warnings: string[];
  port: number;
  host: string | null;
  hostName: string | null;
  mode: "ssh-pull" | "agent-push" | "agent-push-and-ssh" | "down";
  healthy: boolean;
  agent: {
    hostId: string | null;
    lastSeenAt: string | null;
    ageSeconds: number | null;
    fresh: boolean;
  };
};

async function call(): Promise<{ body: LabHealthBody }> {
  const { GET } = await import("@/app/api/admin/lab-health/route");
  const res = await GET(new Request("http://localhost/api/admin/lab-health"));
  return { body: (await res.json()) as LabHealthBody };
}

describe("/api/admin/lab-health", () => {
  it("reports not-configured when COLLECTOR_HOST_1 is unset", async () => {
    const { body } = await call();
    expect(body.configured).toBe(false);
    expect(body.tcpReachable).toBe(false);
    expect(body.warnings.some((w) => w.includes("COLLECTOR_HOST_1"))).toBe(true);
  });

  it("returns healthy when sshd answers with an SSH-2.0 banner", async () => {
    await startServer("ssh-banner");
    process.env.COLLECTOR_HOST_1 = "127.0.0.1";
    process.env.COLLECTOR_HOST_1_NAME = "lab-test";
    process.env.COLLECTOR_PORT = String(port);
    const { body } = await call();
    expect(body.configured).toBe(true);
    expect(body.tcpReachable).toBe(true);
    expect(body.bannerLooksHealthy).toBe(true);
    expect(body.sshBanner).toMatch(/^SSH-2\.0-/);
    expect(body.host).toBe("127.0.0.1");
    expect(body.hostName).toBe("lab-test");
    expect(body.port).toBe(port);
    // A non-22 port that's still healthy gets a soft "if you replace
    // the VM, keep the firewall in sync" reminder rather than a red
    // warning. That's intentional.
    expect(body.warnings.length).toBeLessThanOrEqual(1);
  });

  it("flags 'TCP open, sshd not responding' when the port is alive but no banner arrives", async () => {
    await startServer("no-banner");
    process.env.COLLECTOR_HOST_1 = "127.0.0.1";
    process.env.COLLECTOR_PORT = String(port);
    const { body } = await call();
    expect(body.configured).toBe(true);
    expect(body.tcpReachable).toBe(true);
    expect(body.bannerLooksHealthy).toBe(false);
    expect(body.warnings.some((w) => w.includes("did not receive an SSH-2.0 banner"))).toBe(true);
  });

  it("flags 'unreachable' when the port is closed (firewall regression)", async () => {
    // Don't start a server — connect to a port we know is closed.
    process.env.COLLECTOR_HOST_1 = "127.0.0.1";
    // Pick a high port unlikely to have a listener.
    process.env.COLLECTOR_PORT = "1";
    const { body } = await call();
    expect(body.configured).toBe(true);
    expect(body.tcpReachable).toBe(false);
    expect(body.bannerLooksHealthy).toBe(false);
    expect(body.healthy).toBe(false);
    expect(body.mode).toBe("down");
    expect(body.warnings.some((w) => w.includes("TCP connect"))).toBe(true);
  });

  it("treats a fresh push-agent ingest as healthy even when the SSH probe fails", async () => {
    // SSH probe will time out (no server, port=1) — but the agent has
    // reported within the freshness window, which is the supported
    // health signal for App-Platform-hosted instances.
    process.env.COLLECTOR_HOST_1 = "127.0.0.1";
    process.env.COLLECTOR_PORT = "1";
    baselineMock.getBaseline.mockResolvedValue({
      hostId: "host-127-0-0-1",
      collectedAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const { body } = await call();
    expect(body.configured).toBe(true);
    expect(body.tcpReachable).toBe(false);
    expect(body.healthy).toBe(true);
    expect(body.mode).toBe("agent-push");
    expect(body.agent.fresh).toBe(true);
    expect(body.agent.hostId).toBe("host-127-0-0-1");
    expect(body.agent.ageSeconds).toBeGreaterThanOrEqual(60);
    expect(body.agent.ageSeconds).toBeLessThanOrEqual(75);
    expect(body.warnings.some((w) => w.includes("push-agent"))).toBe(true);
  });

  it("flags 'agent-stale' when the last ingest is older than the freshness window", async () => {
    process.env.COLLECTOR_HOST_1 = "127.0.0.1";
    process.env.COLLECTOR_PORT = "1";
    process.env.LAB_AGENT_FRESH_WINDOW_SECONDS = "300";
    baselineMock.getBaseline.mockResolvedValue({
      hostId: "host-127-0-0-1",
      collectedAt: new Date(Date.now() - 600_000).toISOString(),
    });

    const { body } = await call();
    expect(body.healthy).toBe(false);
    expect(body.mode).toBe("down");
    expect(body.agent.fresh).toBe(false);
    expect(body.warnings.some((w) => w.includes("exceeds the freshness window"))).toBe(true);
  });

  it("reports mode=agent-push-and-ssh when both signals are healthy", async () => {
    await startServer("ssh-banner");
    process.env.COLLECTOR_HOST_1 = "127.0.0.1";
    process.env.COLLECTOR_PORT = String(port);
    baselineMock.getBaseline.mockResolvedValue({
      hostId: "host-127-0-0-1",
      collectedAt: new Date(Date.now() - 30_000).toISOString(),
    });
    const { body } = await call();
    expect(body.healthy).toBe(true);
    expect(body.mode).toBe("agent-push-and-ssh");
    expect(body.agent.fresh).toBe(true);
    expect(body.bannerLooksHealthy).toBe(true);
  });
});
