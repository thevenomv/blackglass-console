import { afterEach, describe, expect, it, vi } from "vitest";
import { scanCredentialToSshAuth } from "@/lib/server/secrets/credential-to-ssh-auth";
import { createPrivateKeyScanCredential, createSshCertificateScanCredential } from "@/lib/server/secrets/credential-factory";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SECRET_PROVIDER;
  delete process.env.VAULT_ADDR;
  delete process.env.VAULT_TOKEN;
  delete process.env.VAULT_SSH_SIGN_ROLE;
  delete process.env.VAULT_SSH_MOUNT;
  vi.resetModules();
});

describe("scanCredentialToSshAuth", () => {
  it("maps private_key to pem mode", () => {
    const buf = Buffer.from("-----BEGIN x-----\na\n-----END x-----", "utf8");
    const c = createPrivateKeyScanCredential(buf);
    const a = scanCredentialToSshAuth(c);
    expect(a.mode).toBe("pem");
    if (a.mode === "pem") expect(a.privateKey).toContain("BEGIN x");
    c.release();
  });

  it("maps ssh_certificate to cert mode", () => {
    const c = createSshCertificateScanCredential(
      "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----",
      "ssh-ed25519-cert-v01@openssh.com AAAAnn5",
    );
    const a = scanCredentialToSshAuth(c);
    expect(a.mode).toBe("cert");
    if (a.mode === "cert") {
      expect(a.publicKey).toContain("ssh-ed25519-cert");
    }
    c.release();
  });
});

describe("VaultSecretProvider (mocked fetch)", () => {
  it("issues ssh_certificate from sign endpoint", async () => {
    process.env.SECRET_PROVIDER = "vault";
    process.env.VAULT_ADDR = "https://vault.test:8200";
    process.env.VAULT_TOKEN = "tok";
    process.env.VAULT_SSH_SIGN_ROLE = "blackglass";
    process.env.VAULT_SSH_MOUNT = "ssh";

    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        call++;
        if (url.includes("/v1/ssh/sign/blackglass")) {
          expect(init?.method).toBe("POST");
          const body = init?.body ? JSON.parse(String(init.body)) : {};
          expect(body.public_key).toContain("ssh-ed25519");
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  data: {
                    signed_key: "ssh-ed25519-cert-v01@openssh.com AAAAFakeCert",
                    serial_number: "42",
                  },
                }),
              ),
          });
        }
        return Promise.reject(new Error(`unexpected fetch ${url}`));
      }),
    );

    vi.resetModules();
    const { VaultSecretProvider } = await import(
      "@/lib/server/secrets/providers/vault-secret-provider"
    );
    const p = new VaultSecretProvider();
    const cred = await p.fetchScanCredential({
      scanId: "s",
      reason: "drift_scan",
      hostCount: 1,
    });
    expect(cred.kind).toBe("ssh_certificate");
    expect(call).toBeGreaterThanOrEqual(1);
    cred.release();
  });
});
