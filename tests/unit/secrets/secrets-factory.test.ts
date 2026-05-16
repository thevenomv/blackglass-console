import { afterEach, describe, expect, it, vi } from "vitest";

describe("secrets factory", () => {
  afterEach(() => {
    delete process.env.SECRET_PROVIDER;
    delete process.env.SSH_PRIVATE_KEY;
    delete process.env.DOPPLER_TOKEN;
    delete process.env.DOPPLER_PROJECT;
    delete process.env.DOPPLER_CONFIG;
    delete process.env.INFISICAL_CLIENT_ID;
    delete process.env.INFISICAL_CLIENT_SECRET;
    delete process.env.INFISICAL_PROJECT_ID;
    delete process.env.INFISICAL_ENV_SLUG;
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_SSH_SIGN_ROLE;
    delete process.env.VAULT_TOKEN;
    delete process.env.VAULT_ROLE_ID;
    delete process.env.VAULT_SECRET_ID;
    vi.resetModules();
  });

  it("credentialSourceConfigured is true for default env + SSH_PRIVATE_KEY", async () => {
    process.env.SSH_PRIVATE_KEY = "-----BEGIN x-----\nabc\n-----END x-----";
    const { credentialSourceConfigured } = await import("@/lib/server/secrets");
    expect(credentialSourceConfigured()).toBe(true);
  });

  it("credentialSourceConfigured is false when env provider missing SSH_PRIVATE_KEY", async () => {
    process.env.SECRET_PROVIDER = "env";
    const { credentialSourceConfigured } = await import("@/lib/server/secrets");
    expect(credentialSourceConfigured()).toBe(false);
  });

  it("credentialSourceConfigured for doppler requires project + config (token optional)", async () => {
    process.env.SECRET_PROVIDER = "doppler";
    const { credentialSourceConfigured } = await import("@/lib/server/secrets");
    expect(credentialSourceConfigured()).toBe(false);

    process.env.DOPPLER_PROJECT = "p";
    process.env.DOPPLER_CONFIG = "c";
    vi.resetModules();
    const mod = await import("@/lib/server/secrets");
    expect(mod.credentialSourceConfigured()).toBe(true);
  });

  it("credentialSourceConfigured for infisical requires identity + project + env slug", async () => {
    process.env.SECRET_PROVIDER = "infisical";
    const { credentialSourceConfigured } = await import("@/lib/server/secrets");
    expect(credentialSourceConfigured()).toBe(false);

    process.env.INFISICAL_CLIENT_ID = "id";
    process.env.INFISICAL_CLIENT_SECRET = "sec";
    process.env.INFISICAL_PROJECT_ID = "proj";
    process.env.INFISICAL_ENV_SLUG = "prod";
    vi.resetModules();
    const mod = await import("@/lib/server/secrets");
    expect(mod.credentialSourceConfigured()).toBe(true);
  });

  it("credentialSourceConfigured for vault requires addr, SSH sign role, and token or AppRole", async () => {
    process.env.SECRET_PROVIDER = "vault";
    let mod = await import("@/lib/server/secrets");
    expect(mod.credentialSourceConfigured()).toBe(false);

    process.env.VAULT_ADDR = "https://vault.example:8200";
    vi.resetModules();
    mod = await import("@/lib/server/secrets");
    expect(mod.credentialSourceConfigured()).toBe(false);

    process.env.VAULT_SSH_SIGN_ROLE = "collector";
    vi.resetModules();
    mod = await import("@/lib/server/secrets");
    expect(mod.credentialSourceConfigured()).toBe(false);

    process.env.VAULT_TOKEN = "root";
    vi.resetModules();
    mod = await import("@/lib/server/secrets");
    expect(mod.credentialSourceConfigured()).toBe(true);

    delete process.env.VAULT_TOKEN;
    process.env.VAULT_ROLE_ID = "rid";
    process.env.VAULT_SECRET_ID = "sid";
    vi.resetModules();
    mod = await import("@/lib/server/secrets");
    expect(mod.credentialSourceConfigured()).toBe(true);
  });
  it("createSecretProviderFromEnv throws SecretFetchError for unknown provider", async () => {
    process.env.SECRET_PROVIDER = "nope";
    const { createSecretProviderFromEnv, SecretFetchError } = await import("@/lib/server/secrets");
    expect(() => createSecretProviderFromEnv()).toThrow(SecretFetchError);
  });
});
