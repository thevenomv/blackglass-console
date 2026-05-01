import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function syntheticCommandOutput(cmd: string): string {
  if (cmd.includes("ss -tlnp") || cmd.includes("netstat")) {
    return `LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=1,fd=3))\n`;
  }
  if (cmd.includes("/etc/passwd")) return "alice:1000\n";
  if (cmd.includes("getent")) return "sudo:x:27:alice\n";
  if (cmd.includes("cron.d")) return "weekly\n";
  if (cmd.includes("systemctl")) return "ssh.service loaded active running SSH\n";
  if (cmd.includes("sshd")) return "permitrootlogin no\npasswordauthentication no\n";
  if (cmd.includes("ufw")) return "Status: active\nDefault: deny (incoming)\n-----------\n22/tcp ALLOW\n";
  return "";
}

vi.mock("ssh2", () => {
  class MockClient {
    private handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

    on(ev: string, fn: (...args: unknown[]) => void) {
      (this.handlers[ev] ??= []).push(fn);
    }

    connect(_cfg: unknown) {
      queueMicrotask(() => {
        this.handlers["ready"]?.forEach((f) => f());
      });
    }

    exec(cmd: string, cb: (err: Error | null, stream: unknown) => void) {
      const out = syntheticCommandOutput(cmd);
      const stream = {
        stdout: {
          on(e: string, fn: (b: Buffer) => void) {
            if (e === "data") queueMicrotask(() => fn(Buffer.from(out)));
          },
        },
        stderr: { on: () => {} },
        on(e: string, fn: () => void) {
          if (e === "close") queueMicrotask(() => queueMicrotask(fn));
        },
      };
      cb(null, stream);
    }

    end() {}
  }

  return { Client: MockClient };
});

const PEM =
  "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz\n-----END OPENSSH PRIVATE KEY-----";

describe("collector SSH (mocked ssh2)", () => {
  beforeEach(() => {
    process.env.COLLECTOR_HOST_1 = "127.0.0.1";
    process.env.SSH_PRIVATE_KEY = PEM;
    delete process.env.COLLECTOR_HOST_2;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.COLLECTOR_HOST_1;
    delete process.env.SSH_PRIVATE_KEY;
    vi.resetModules();
  });

  it("collectSnapshot maps exec output into HostSnapshot", async () => {
    const { collectSnapshot } = await import("@/lib/server/collector");
    const snap = await collectSnapshot();
    expect(snap.hostId).toBe("host-127-0-0-1");
    expect(snap.hostname).toBe("127.0.0.1");
    expect(snap.listeners.some((l) => l.port === 22)).toBe(true);
    expect(snap.users).toContainEqual({ username: "alice", uid: 1000 });
    expect(snap.sudoers).toContain("alice");
    expect(snap.firewall.active).toBe(true);
  });

  it("collectAllSnapshots resolves one host when only COLLECTOR_HOST_1 set", async () => {
    const { collectAllSnapshots } = await import("@/lib/server/collector");
    const results = await collectAllSnapshots();
    expect(results).toHaveLength(1);
    expect(results[0].error).toBeUndefined();
    expect(results[0].snapshot?.hostId).toBe("host-127-0-0-1");
  });
});
