import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// probeTcp uses native net; resolve immediately so the ssh2 mock's error drives the assertion.
vi.mock("net", () => ({
  createConnection: (_opts: unknown) => {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const socket = {
      setTimeout: () => socket,
      destroy: () => {},
      on(ev: string, fn: (...args: unknown[]) => void) {
        (handlers[ev] ??= []).push(fn);
        if (ev === "connect") queueMicrotask(() => fn());
        return socket;
      },
    };
    return socket;
  },
}));

vi.mock("ssh2", () => {
  class FailingClient {
    private handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

    on(ev: string, fn: (...args: unknown[]) => void) {
      (this.handlers[ev] ??= []).push(fn);
    }

    connect(_cfg: unknown) {
      queueMicrotask(() => {
        const err = new Error("ECONNREFUSED");
        this.handlers["error"]?.forEach((f) => f(err));
      });
    }

    end() {}
  }

  return { Client: FailingClient };
});

const PEM =
  "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz\n-----END OPENSSH PRIVATE KEY-----";

describe("collector SSH failures (mocked ssh2)", () => {
  beforeEach(() => {
    process.env.COLLECTOR_HOST_1 = "10.0.0.1";
    process.env.SSH_PRIVATE_KEY = PEM;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.COLLECTOR_HOST_1;
    delete process.env.SSH_PRIVATE_KEY;
    vi.resetModules();
  });

  it("collectSnapshot rejects when connection errors", async () => {
    const { collectSnapshot } = await import("@/lib/server/collector");
    await expect(collectSnapshot()).rejects.toThrow(/SSH connection error/);
  });

  it("collectAllSnapshots captures per-host error string", async () => {
    const { collectAllSnapshots } = await import("@/lib/server/collector");
    const results = await collectAllSnapshots();
    expect(results).toHaveLength(1);
    expect(results[0].snapshot).toBeUndefined();
    expect(results[0].error).toMatch(/SSH connection error/);
  });
});
