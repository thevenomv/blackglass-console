import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SECRET_PROVIDER;
  delete process.env.VAULT_ADDR;
  delete process.env.VAULT_TOKEN;
  delete process.env.VAULT_SSH_SIGN_ROLE;
  delete process.env.VAULT_SSH_MOUNT;
  delete process.env.BLACKGLASS_VAULT_REVOKE_AFTER_SCAN;
  vi.resetModules();
});

describe("runWithCollectorCredential + Vault revoke", () => {
  it("calls revoke when BLACKGLASS_VAULT_REVOKE_AFTER_SCAN is true and serial present", async () => {
    process.env.SECRET_PROVIDER = "vault";
    process.env.VAULT_ADDR = "https://vault.test:8200";
    process.env.VAULT_TOKEN = "tok";
    process.env.VAULT_SSH_SIGN_ROLE = "blackglass";
    process.env.VAULT_SSH_MOUNT = "ssh";
    process.env.BLACKGLASS_VAULT_REVOKE_AFTER_SCAN = "true";

    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        urls.push(url);
        if (url.includes("/v1/ssh/sign/blackglass")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  data: {
                    signed_key: "ssh-ed25519-cert-v01@openssh.com AAAAFakeCert",
                    serial_number: "serial-99",
                  },
                }),
              ),
          });
        }
        if (url.includes("/v1/ssh/revoke")) {
          expect(init?.method).toBe("POST");
          const body = init?.body ? JSON.parse(String(init.body)) : {};
          expect(body.serial_number).toBe("serial-99");
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve("{}"),
          });
        }
        return Promise.reject(new Error(`unexpected fetch ${url}`));
      }),
    );

    vi.resetModules();
    const { runWithCollectorCredential } = await import("@/lib/server/secrets");

    await runWithCollectorCredential(
      { scanId: "scan-revoke", reason: "drift_scan", hostCount: 1 },
      async () => "ok",
    );

    expect(urls.some((u) => u.includes("/v1/ssh/revoke"))).toBe(true);
  });

  it("skips revoke when BLACKGLASS_VAULT_REVOKE_AFTER_SCAN is unset", async () => {
    process.env.SECRET_PROVIDER = "vault";
    process.env.VAULT_ADDR = "https://vault.test:8200";
    process.env.VAULT_TOKEN = "tok";
    process.env.VAULT_SSH_SIGN_ROLE = "blackglass";
    process.env.VAULT_SSH_MOUNT = "ssh";

    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes("/v1/ssh/sign/blackglass")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  data: {
                    signed_key: "ssh-ed25519-cert-v01@openssh.com AAAAFakeCert",
                    serial_number: "serial-99",
                  },
                }),
              ),
          });
        }
        return Promise.reject(new Error(`unexpected fetch ${url}`));
      }),
    );

    vi.resetModules();
    const { runWithCollectorCredential } = await import("@/lib/server/secrets");

    await runWithCollectorCredential(
      { scanId: "scan-norevoke", reason: "drift_scan", hostCount: 1 },
      async () => "ok",
    );

    expect(urls.some((u) => u.includes("/v1/ssh/revoke"))).toBe(false);
  });
});
