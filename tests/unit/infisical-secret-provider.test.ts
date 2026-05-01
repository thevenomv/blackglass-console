import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("InfisicalSecretProvider", () => {
  beforeEach(() => {
    process.env.SECRET_PROVIDER = "infisical";
    process.env.INFISICAL_CLIENT_ID = "cid";
    process.env.INFISICAL_CLIENT_SECRET = "csec";
    process.env.INFISICAL_PROJECT_ID = "pid";
    process.env.INFISICAL_ENV_SLUG = "prod";
    process.env.INFISICAL_SITE_URL = "https://infisical.example";

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/universal-auth/login")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: { accessToken: "tok" } }),
          text: () => Promise.resolve(""),
        });
      }
      if (url.includes("/api/v3/secrets/raw/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ secretValue: "-----BEGIN x-----\nk\\n-----END x-----" }),
          text: () => Promise.resolve(""),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SECRET_PROVIDER;
    delete process.env.INFISICAL_CLIENT_ID;
    delete process.env.INFISICAL_CLIENT_SECRET;
    delete process.env.INFISICAL_PROJECT_ID;
    delete process.env.INFISICAL_ENV_SLUG;
    delete process.env.INFISICAL_SITE_URL;
    vi.resetModules();
  });

  it("logs in then fetches raw secret", async () => {
    const { createSecretProviderFromEnv } = await import("@/lib/server/secrets");
    const p = createSecretProviderFromEnv();
    const cred = await p.fetchScanCredential({
      scanId: "s1",
      reason: "baseline",
      hostCount: 2,
    });
    expect(cred.kind).toBe("private_key");
    if (cred.kind !== "private_key") throw new Error("expected private_key");
    expect(cred.material.toString("utf8")).toContain("BEGIN x");
    cred.release();
    expect(vi.mocked(fetch).mock.calls.length).toBe(2);
  });
});
