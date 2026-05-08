/**
 * Tests for the BYOK Phase 2 routing in envelope.ts.
 *
 * We mock the per-tenant lookup so the test is hermetic (no DB required).
 * The KMS provider is "local" globally — when BYOK is off we round-trip
 * through that. When BYOK + a tenant config are mocked on, encrypt
 * tags the blob with `tenantId` AND would normally call the customer
 * KEK — we stub the wrap/unwrap path so we can assert the routing
 * behaviour without dragging in `@aws-sdk/client-kms`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIG_BYOK = process.env.BYOK_ENABLED;
const ORIG_KMS = process.env.KMS_PROVIDER;
const ORIG_LOCAL = process.env.KMS_LOCAL_SECRET;

beforeEach(() => {
  vi.resetModules();
  process.env.KMS_PROVIDER = "local";
  process.env.KMS_LOCAL_SECRET = "x".repeat(64);
  delete process.env.BYOK_ENABLED;
});
afterEach(() => {
  if (ORIG_BYOK === undefined) delete process.env.BYOK_ENABLED;
  else process.env.BYOK_ENABLED = ORIG_BYOK;
  if (ORIG_KMS === undefined) delete process.env.KMS_PROVIDER;
  else process.env.KMS_PROVIDER = ORIG_KMS;
  if (ORIG_LOCAL === undefined) delete process.env.KMS_LOCAL_SECRET;
  else process.env.KMS_LOCAL_SECRET = ORIG_LOCAL;
  vi.restoreAllMocks();
});

describe("envelope BYOK routing", () => {
  it("round-trips through the global KEK when BYOK is off (no tenantId on blob)", async () => {
    const { encryptKey, decryptKey } = await import("../../src/lib/server/secrets/envelope");
    const blob = await encryptKey("tenant-a", "hello world");
    expect(blob.kmsProvider).toBe("local");
    // No tenantId field — old blobs and BYOK-off blobs both look like this.
    expect(blob.tenantId ?? null).toBeNull();
    const out = await decryptKey("tenant-a", blob);
    expect(out.toString("utf8")).toBe("hello world");
  });

  it("ignores BYOK_ENABLED when no tenant row exists (lookup returns null)", async () => {
    process.env.BYOK_ENABLED = "true";
    vi.doMock("../../src/lib/server/secrets/tenant-kms", async () => {
      const real = await vi.importActual<typeof import("../../src/lib/server/secrets/tenant-kms")>(
        "../../src/lib/server/secrets/tenant-kms",
      );
      return {
        ...real,
        byokEnabled: () => true,
        loadTenantKmsConfig: vi.fn().mockResolvedValue(null),
      };
    });
    const { encryptKey, decryptKey } = await import("../../src/lib/server/secrets/envelope");
    const blob = await encryptKey("tenant-a", "fallback path");
    expect(blob.tenantId ?? null).toBeNull();
    const out = await decryptKey("tenant-a", blob);
    expect(out.toString("utf8")).toBe("fallback path");
  });

  it("decrypt rejects a tenant-tagged blob when BYOK is later disabled", async () => {
    // Construct a blob "as if" BYOK had wrapped it. We don't actually
    // call vault/awskms — we hand-build the blob with tenantId set and
    // then point decrypt at a tenant-kms module that says "BYOK is off".
    process.env.BYOK_ENABLED = "false";
    vi.doMock("../../src/lib/server/secrets/tenant-kms", () => ({
      byokEnabled: () => false,
      loadTenantKmsConfig: vi.fn().mockResolvedValue(null),
    }));
    const { decryptKey } = await import("../../src/lib/server/secrets/envelope");
    await expect(
      decryptKey("tenant-a", {
        ciphertext: "ignored",
        wrappedDek: "ignored",
        kmsProvider: "vault",
        kmsKeyRef: "tenant-key",
        tenantId: "tenant-a",
      }),
    ).rejects.toThrow(/BYOK_ENABLED is now false/);
  });

  it("decrypt rejects a tenant-tagged blob when the row was disabled", async () => {
    process.env.BYOK_ENABLED = "true";
    vi.doMock("../../src/lib/server/secrets/tenant-kms", () => ({
      byokEnabled: () => true,
      loadTenantKmsConfig: vi.fn().mockResolvedValue(null),
    }));
    const { decryptKey } = await import("../../src/lib/server/secrets/envelope");
    await expect(
      decryptKey("tenant-a", {
        ciphertext: "ignored",
        wrappedDek: "ignored",
        kmsProvider: "vault",
        kmsKeyRef: "tenant-key",
        tenantId: "tenant-a",
      }),
    ).rejects.toThrow(/no enabled saas_tenant_kms_keys row exists/);
  });

  it("decrypt rejects a tenant-tagged blob when the provider type changed", async () => {
    process.env.BYOK_ENABLED = "true";
    vi.doMock("../../src/lib/server/secrets/tenant-kms", () => ({
      byokEnabled: () => true,
      loadTenantKmsConfig: vi.fn().mockResolvedValue({
        id: "id",
        tenantId: "tenant-a",
        provider: "awskms",
        keyRef: "arn",
        providerSecretEncrypted: null,
        enabled: true,
        lastVerifiedAt: null,
        lastVerifyError: null,
      }),
    }));
    const { decryptKey } = await import("../../src/lib/server/secrets/envelope");
    await expect(
      decryptKey("tenant-a", {
        ciphertext: "ignored",
        wrappedDek: "ignored",
        kmsProvider: "vault", // mismatch — blob was vault, config now awskms
        kmsKeyRef: "tenant-key",
        tenantId: "tenant-a",
      }),
    ).rejects.toThrow(/doesn't match current tenant config/);
  });

  it("local provider blob is rejected when tenantId is set (BYOK only supports vault/awskms)", async () => {
    process.env.BYOK_ENABLED = "true";
    vi.doMock("../../src/lib/server/secrets/tenant-kms", () => ({
      byokEnabled: () => true,
      loadTenantKmsConfig: vi.fn(),
    }));
    const { decryptKey } = await import("../../src/lib/server/secrets/envelope");
    await expect(
      decryptKey("tenant-a", {
        ciphertext: "ignored",
        wrappedDek: "ignored",
        kmsProvider: "local",
        kmsKeyRef: "local",
        tenantId: "tenant-a",
      }),
    ).rejects.toThrow(/BYOK only supports 'vault' or 'awskms'/);
  });
});
