import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadCli = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      SSH_PRIVATE_KEY:
        "-----BEGIN OPENSSH PRIVATE KEY-----\\nLINE\\n-----END OPENSSH PRIVATE KEY-----",
    }),
  ),
);

vi.mock("@/lib/server/secrets/doppler-cli-download", () => ({
  loadDopplerSecretsJsonViaCli: loadCli,
}));

describe("DopplerSecretProvider", () => {
  beforeEach(() => {
    loadCli.mockClear();
    process.env.SECRET_PROVIDER = "doppler";
    process.env.DOPPLER_TOKEN = "dp.test";
    process.env.DOPPLER_PROJECT = "blackglass";
    process.env.DOPPLER_CONFIG = "prd";
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              SSH_PRIVATE_KEY: "-----BEGIN OPENSSH PRIVATE KEY-----\\nLINE\\n-----END OPENSSH PRIVATE KEY-----",
            }),
          text: () => Promise.resolve(""),
        }),
      ),
    );
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SECRET_PROVIDER;
    delete process.env.DOPPLER_TOKEN;
    delete process.env.DOPPLER_PROJECT;
    delete process.env.DOPPLER_CONFIG;
    delete process.env.BLACKGLASS_SSH_SECRET_NAME;
    vi.resetModules();
  });

  it("fetchScanCredential downloads JSON and returns private_key credential", async () => {
    const { createSecretProviderFromEnv } = await import("@/lib/server/secrets");
    const p = createSecretProviderFromEnv();
    const cred = await p.fetchScanCredential({
      scanId: "s1",
      reason: "drift_scan",
      hostCount: 1,
    });
    expect(cred.kind).toBe("private_key");
    if (cred.kind !== "private_key") throw new Error("expected private_key");
    expect(cred.material.toString("utf8")).toContain("BEGIN OPENSSH PRIVATE KEY");
    expect(cred.material.toString("utf8")).toContain("\nLINE\n");
    cred.release();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(loadCli).not.toHaveBeenCalled();
  });

  it("fetchScanCredential uses CLI download when DOPPLER_TOKEN is unset", async () => {
    delete process.env.DOPPLER_TOKEN;
    process.env.DOPPLER_PROJECT = "blackglass";
    process.env.DOPPLER_CONFIG = "dev";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("fetch should not be used without token"))),
    );
    vi.resetModules();
    const { DopplerSecretProvider } = await import(
      "@/lib/server/secrets/providers/doppler-secret-provider"
    );
    const p = new DopplerSecretProvider();
    const cred = await p.fetchScanCredential({
      scanId: "s-cli",
      reason: "drift_scan",
      hostCount: 1,
    });
    expect(cred.kind).toBe("private_key");
    expect(loadCli).toHaveBeenCalledTimes(1);
    cred.release();
  });
});
