/**
 * Envelope encryption for SSH private keys stored at rest.
 *
 * Architecture:
 *   1. A per-workspace Data Encryption Key (DEK) is generated with AES-256-GCM.
 *   2. The DEK is wrapped (encrypted) by a Key Encryption Key (KEK) from the
 *      configured KMS provider.
 *   3. Only the *wrapped DEK* and the *encrypted key material* are stored in
 *      Postgres.  Neither the plain DEK nor the raw SSH key is ever persisted.
 *
 * KEK providers (selected by KMS_PROVIDER env var):
 *   - "local"  — AES-256-GCM using KMS_LOCAL_SECRET (dev/staging only)
 *   - "vault"  — HashiCorp Vault Transit engine (VAULT_ADDR + VAULT_TOKEN)
 *   - "awskms" — AWS KMS (AWS_KMS_KEY_ID + standard AWS SDK env vars)
 *
 * When KMS_PROVIDER is unset, encryption is a no-op passthrough (dev fallback
 * that warns loudly so it is never used silently in production).
 *
 * Usage:
 *   const { ciphertext, wrappedDek } = await encryptKey("workspace-id", rawPem);
 *   // store ciphertext + wrappedDek in Postgres
 *
 *   const plainPem = await decryptKey("workspace-id", ciphertext, wrappedDek);
 *   // use for SSH, then let GC release
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EncryptedKey = {
  /** Base64-encoded AES-256-GCM ciphertext + 12-byte IV + 16-byte auth tag. */
  ciphertext: string;
  /** Base64-encoded DEK wrapped by the KMS KEK. */
  wrappedDek: string;
  /** Which KMS provider wrapped this DEK — for safe future rotation. */
  kmsProvider: string;
  /** Opaque KMS key reference (Vault key name, AWS key ID, etc.) */
  kmsKeyRef: string;
  /**
   * Tenant id whose customer KMS key wrapped this DEK, when BYOK was
   * active at encrypt time. Null/absent on blobs wrapped by the global
   * KMS — those decrypt through the global path regardless of any
   * later BYOK rollout. Persisting the tenant on the blob is what
   * makes BYOK opt-in safe for backfill: existing rows without this
   * field continue to round-trip through the global KEK forever.
   */
  tenantId?: string | null;
};

// ---------------------------------------------------------------------------
// Internal AES-GCM helpers
// ---------------------------------------------------------------------------

const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Encrypt `plaintext` with the given 32-byte AES-256-GCM key. Returns base64 blob. */
function aesEncrypt(key: Buffer, plaintext: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: [iv (12)] [tag (16)] [body]
  return Buffer.concat([iv, tag, body]).toString("base64");
}

/** Decrypt base64 blob produced by aesEncrypt. */
function aesDecrypt(key: Buffer, blob: string): Buffer {
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_BYTES + TAG_BYTES) throw new Error("Envelope: ciphertext too short");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

// ---------------------------------------------------------------------------
// KMS provider: "local" (dev/staging — AES-256 key from env)
// ---------------------------------------------------------------------------

function localKmsKeyRef(): string {
  return "local";
}

function localKekBuffer(): Buffer {
  const raw = process.env.KMS_LOCAL_SECRET?.trim();
  if (!raw || raw.length < 32) {
    throw new Error(
      "KMS_LOCAL_SECRET must be at least 32 characters (used as AES-256 key material).",
    );
  }
  // Derive exactly 32 bytes by hashing the secret
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(raw, "utf8").digest();
}

async function localWrapDek(dek: Buffer): Promise<string> {
  const kek = localKekBuffer();
  return aesEncrypt(kek, dek);
}

async function localUnwrapDek(wrappedDek: string): Promise<Buffer> {
  const kek = localKekBuffer();
  return aesDecrypt(kek, wrappedDek);
}

// ---------------------------------------------------------------------------
// KMS provider: "vault" (HashiCorp Vault Transit engine)
// ---------------------------------------------------------------------------

async function vaultRequest(path: string, method: string, body?: unknown): Promise<unknown> {
  const addr = process.env.VAULT_ADDR?.trim();
  const token = process.env.VAULT_TOKEN?.trim();
  if (!addr || !token) throw new Error("VAULT_ADDR and VAULT_TOKEN are required for vault KMS");
  const res = await fetch(`${addr}/v1/${path}`, {
    method,
    headers: {
      "X-Vault-Token": token,
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vault ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function vaultTransitKeyName(): string {
  return process.env.VAULT_TRANSIT_KEY ?? "blackglass";
}

async function vaultWrapDek(dek: Buffer): Promise<string> {
  const keyName = vaultTransitKeyName();
  const plaintext = dek.toString("base64");
  const resp = (await vaultRequest(`transit/encrypt/${keyName}`, "POST", { plaintext })) as {
    data: { ciphertext: string };
  };
  return resp.data.ciphertext;
}

async function vaultUnwrapDek(wrappedDek: string): Promise<Buffer> {
  const keyName = vaultTransitKeyName();
  const resp = (await vaultRequest(`transit/decrypt/${keyName}`, "POST", { ciphertext: wrappedDek })) as {
    data: { plaintext: string };
  };
  return Buffer.from(resp.data.plaintext, "base64");
}

// ---------------------------------------------------------------------------
// KMS provider: "awskms" (AWS KMS DataKey)
// ---------------------------------------------------------------------------

async function awsWrapDek(dek: Buffer): Promise<string> {
  const keyId = process.env.AWS_KMS_KEY_ID?.trim();
  if (!keyId) throw new Error("AWS_KMS_KEY_ID is required for awskms provider");
  // Dynamically import the AWS SDK to avoid forcing it as a hard dependency
  const { KMSClient, EncryptCommand } = await import(/* webpackIgnore: true */ "@aws-sdk/client-kms" as string);
  const client = new KMSClient({});
  const cmd = new EncryptCommand({ KeyId: keyId, Plaintext: dek });
  const resp = await client.send(cmd);
  if (!resp.CiphertextBlob) throw new Error("AWS KMS encrypt returned no CiphertextBlob");
  return Buffer.from(resp.CiphertextBlob).toString("base64");
}

async function awsUnwrapDek(wrappedDek: string): Promise<Buffer> {
  const { KMSClient, DecryptCommand } = await import(/* webpackIgnore: true */ "@aws-sdk/client-kms" as string);
  const client = new KMSClient({});
  const cmd = new DecryptCommand({ CiphertextBlob: Buffer.from(wrappedDek, "base64") });
  const resp = await client.send(cmd);
  if (!resp.Plaintext) throw new Error("AWS KMS decrypt returned no Plaintext");
  return Buffer.from(resp.Plaintext);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Active KMS provider label (from KMS_PROVIDER env, default "none"). */
export function kmsProvider(): string {
  return (process.env.KMS_PROVIDER ?? "none").trim().toLowerCase();
}

/** True when envelope encryption is configured (KMS_PROVIDER is set and not "none"). */
export function envelopeEncryptionEnabled(): boolean {
  const p = kmsProvider();
  return p !== "none" && p !== "";
}

/**
 * Startup guard — call once at app boot (e.g. in instrumentation.ts or the
 * first request handler). Throws a hard error in production when KMS is
 * disabled so the process refuses to start rather than silently persisting
 * credentials as base64 plaintext.
 */
export function validateEnvelopeEncryptionConfig(): void {
  if (process.env.NODE_ENV === "production" && kmsProvider() === "none") {
    throw new Error(
      "FATAL: KMS_PROVIDER must be configured in production. " +
        'Set KMS_PROVIDER to "aws", "gcp", "vault", or "local" (with KMS_LOCAL_SECRET). ' +
        "Storing credentials as plaintext is not permitted in production.",
    );
  }
}

/**
 * Resolve the BYOK config for a tenant if (and only if) the feature
 * flag is on AND the tenant has an enabled row. Imported lazily so this
 * module stays decoupled from the DB layer for unit tests / scripts
 * that don't have a database connection.
 */
async function resolveTenantOverride(
  workspaceId: string | undefined,
): Promise<{ provider: "vault" | "awskms"; keyRef: string } | null> {
  if (!workspaceId) return null;
  // Lazy import — avoids dragging Drizzle / pg into bundles that only
  // need symmetric AES (dev tools, etc.).
  const { byokEnabled, loadTenantKmsConfig } = await import("./tenant-kms");
  if (!byokEnabled()) return null;
  const cfg = await loadTenantKmsConfig(workspaceId);
  if (!cfg) return null;
  return { provider: cfg.provider, keyRef: cfg.keyRef };
}

/**
 * Wrap a DEK using a SPECIFIC keyRef (overriding env defaults). Used for
 * BYOK Phase 2 — the tenant's customer KEK identity wins over the
 * deployment's. We assume ambient credentials (IAM instance profile /
 * Vault token) can talk to the customer KMS; per-tenant credential
 * support is a Phase 2.5 follow-up tracked in tenant-kms.ts.
 */
async function wrapWithKeyRef(
  provider: "vault" | "awskms",
  dek: Buffer,
  keyRef: string,
): Promise<string> {
  if (provider === "vault") {
    const resp = (await vaultRequest(`transit/encrypt/${keyRef}`, "POST", {
      plaintext: dek.toString("base64"),
    })) as { data: { ciphertext: string } };
    return resp.data.ciphertext;
  }
  // awskms
  const { KMSClient, EncryptCommand } = await import(
    /* webpackIgnore: true */ "@aws-sdk/client-kms" as string
  );
  const client = new KMSClient({});
  const cmd = new EncryptCommand({ KeyId: keyRef, Plaintext: dek });
  const resp = await client.send(cmd);
  if (!resp.CiphertextBlob) throw new Error("AWS KMS encrypt returned no CiphertextBlob");
  return Buffer.from(resp.CiphertextBlob).toString("base64");
}

async function unwrapWithKeyRef(
  provider: "vault" | "awskms",
  wrappedDek: string,
  keyRef: string,
): Promise<Buffer> {
  if (provider === "vault") {
    const resp = (await vaultRequest(`transit/decrypt/${keyRef}`, "POST", {
      ciphertext: wrappedDek,
    })) as { data: { plaintext: string } };
    return Buffer.from(resp.data.plaintext, "base64");
  }
  // awskms — decrypt is identity-of-key-implicit, but we keep the keyRef
  // around for symmetry with the vault path and for surface future
  // GovCloud / restricted-API requirements.
  const { KMSClient, DecryptCommand } = await import(
    /* webpackIgnore: true */ "@aws-sdk/client-kms" as string
  );
  const client = new KMSClient({});
  const cmd = new DecryptCommand({
    CiphertextBlob: Buffer.from(wrappedDek, "base64"),
    KeyId: keyRef,
  });
  const resp = await client.send(cmd);
  if (!resp.Plaintext) throw new Error("AWS KMS decrypt returned no Plaintext");
  return Buffer.from(resp.Plaintext);
}

/**
 * Encrypt an SSH private key PEM for storage.
 *
 * Returns an `EncryptedKey` that can be safely stored in Postgres.
 * When KMS_PROVIDER is "none", warns and returns the key base64-encoded
 * without encryption (suitable only for development).
 *
 * BYOK (Phase 2): when `workspaceId` is supplied, BYOK_ENABLED is on,
 * AND the tenant has an enabled `saas_tenant_kms_keys` row, the DEK is
 * wrapped by the customer's KEK instead of the deployment's. The
 * tenant id is persisted on the blob so the matching decrypt path
 * resolves the same config. Existing blobs (no `tenantId` field) keep
 * decrypting through the global KEK forever — BYOK rollout never
 * silently re-keys old material.
 */
export async function encryptKey(
  workspaceId: string,
  pemOrBuffer: string | Buffer,
): Promise<EncryptedKey> {
  const plaintext = Buffer.isBuffer(pemOrBuffer)
    ? pemOrBuffer
    : Buffer.from(pemOrBuffer, "utf8");

  const globalProvider = kmsProvider();

  if (globalProvider === "none") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FATAL: KMS_PROVIDER must be configured in production. " +
          'Set KMS_PROVIDER to "aws", "gcp", "vault", or "local" (with KMS_LOCAL_SECRET). ' +
          "Storing credentials as plaintext is not permitted in production.",
      );
    }
    console.warn(
      "[envelope] KMS_PROVIDER is not set — storing SSH key WITHOUT envelope encryption. " +
        "Set KMS_PROVIDER=local|vault|awskms in production.",
    );
    return {
      ciphertext: plaintext.toString("base64"),
      wrappedDek: "",
      kmsProvider: "none",
      kmsKeyRef: "",
    };
  }

  // BYOK override — wrap with the tenant's customer KEK if configured.
  const tenantOverride = await resolveTenantOverride(workspaceId);

  // 1. Generate a fresh 256-bit DEK
  const dek = randomBytes(32);

  // 2. Encrypt key material with DEK
  const ciphertext = aesEncrypt(dek, plaintext);

  // 3. Wrap the DEK with the appropriate KEK
  let wrappedDek: string;
  let kmsKeyRef: string;
  let providerForBlob: string;
  let tenantOnBlob: string | null = null;

  if (tenantOverride) {
    wrappedDek = await wrapWithKeyRef(tenantOverride.provider, dek, tenantOverride.keyRef);
    kmsKeyRef = tenantOverride.keyRef;
    providerForBlob = tenantOverride.provider;
    tenantOnBlob = workspaceId;
  } else if (globalProvider === "local") {
    wrappedDek = await localWrapDek(dek);
    kmsKeyRef = localKmsKeyRef();
    providerForBlob = "local";
  } else if (globalProvider === "vault") {
    wrappedDek = await vaultWrapDek(dek);
    kmsKeyRef = vaultTransitKeyName();
    providerForBlob = "vault";
  } else if (globalProvider === "awskms") {
    wrappedDek = await awsWrapDek(dek);
    kmsKeyRef = process.env.AWS_KMS_KEY_ID ?? "";
    providerForBlob = "awskms";
  } else {
    throw new Error(`Unknown KMS_PROVIDER: ${globalProvider}. Use local, vault, or awskms.`);
  }

  // Zero-fill the DEK from memory immediately after wrapping
  dek.fill(0);

  return {
    ciphertext,
    wrappedDek,
    kmsProvider: providerForBlob,
    kmsKeyRef,
    ...(tenantOnBlob ? { tenantId: tenantOnBlob } : {}),
  };
}

/**
 * Decrypt an `EncryptedKey` back to a plaintext PEM Buffer.
 * The caller is responsible for zeroing the buffer when done.
 *
 * BYOK (Phase 2): when the blob carries a `tenantId`, the tenant's
 * customer KEK is consulted via `loadTenantKmsConfig()` and the DEK is
 * unwrapped against the customer's keyRef. If the tenant has since
 * disabled or removed BYOK, this throws — refusing to silently fall
 * back to the global KEK (which would never have wrapped this DEK in
 * the first place, so the unwrap would also fail with a less obvious
 * error). Operators see the failure and can re-enable BYOK or
 * re-encrypt the credential explicitly.
 */
export async function decryptKey(
  workspaceId: string,
  encKey: EncryptedKey,
): Promise<Buffer> {
  const { ciphertext, wrappedDek, kmsProvider: provider, tenantId, kmsKeyRef: storedKeyRef } = encKey;

  if (provider === "none") {
    return Buffer.from(ciphertext, "base64");
  }

  // SEC-09: Reject blobs whose embedded tenantId doesn't match the caller's
  // workspace. A mismatch means the blob was encrypted for a different tenant
  // and should never be decryptable in this context.
  if (tenantId && workspaceId && tenantId !== workspaceId) {
    throw new Error(
      `Security violation: EncryptedKey tenantId (${tenantId}) does not match ` +
        `the caller workspaceId (${workspaceId}). Refusing to decrypt.`,
    );
  }

  let dek: Buffer;

  if (tenantId) {
    if (provider !== "vault" && provider !== "awskms") {
      throw new Error(
        `Stored EncryptedKey has tenantId=${tenantId} but provider=${provider}; ` +
          `BYOK only supports 'vault' or 'awskms'.`,
      );
    }
    const { byokEnabled, loadTenantKmsConfig } = await import("./tenant-kms");
    if (!byokEnabled()) {
      throw new Error(
        `EncryptedKey was wrapped by a tenant KEK (tenantId=${tenantId}) but ` +
          `BYOK_ENABLED is now false. Re-enable BYOK to decrypt, or re-encrypt this credential.`,
      );
    }
    const cfg = await loadTenantKmsConfig(tenantId);
    if (!cfg) {
      throw new Error(
        `EncryptedKey was wrapped by a tenant KEK (tenantId=${tenantId}) but no enabled ` +
          `saas_tenant_kms_keys row exists. Re-add the BYOK row or re-encrypt this credential.`,
      );
    }
    if (cfg.provider !== provider) {
      throw new Error(
        `EncryptedKey provider (${provider}) doesn't match current tenant config (${cfg.provider}).`,
      );
    }
    // SEC-06: Prefer the keyRef stored on the blob at encrypt time; fall back
    // to the current cfg.keyRef only if the stored ref fails. This allows key
    // rotation without permanently breaking decryption of previously-wrapped DEKs.
    const primaryKeyRef = storedKeyRef || cfg.keyRef;
    try {
      dek = await unwrapWithKeyRef(provider, wrappedDek, primaryKeyRef);
    } catch (primaryErr) {
      if (primaryKeyRef !== cfg.keyRef) {
        // Fall back to the current configured keyRef (post-rotation path).
        dek = await unwrapWithKeyRef(provider, wrappedDek, cfg.keyRef);
      } else {
        throw primaryErr;
      }
    }
  } else if (provider === "local") {
    dek = await localUnwrapDek(wrappedDek);
  } else if (provider === "vault") {
    dek = await vaultUnwrapDek(wrappedDek);
  } else if (provider === "awskms") {
    dek = await awsUnwrapDek(wrappedDek);
  } else {
    throw new Error(`Unknown kmsProvider in stored record: ${provider}`);
  }

  const plaintext = aesDecrypt(dek, ciphertext);
  dek.fill(0);
  return plaintext;
}

/**
 * Transparently decrypt a credential value that may be either:
 *   - A plain SSH PEM string  (begins with "-----BEGIN")
 *   - A JSON blob matching `EncryptedKey` (`{ ciphertext, wrappedDek, kmsProvider, ... }`)
 *
 * This allows operators to store envelope-encrypted SSH keys in any secret
 * manager (Doppler, Infisical, env var) without a separate code path.
 * When KMS_PROVIDER is unset and the value is not an EncryptedKey JSON, it is
 * returned as-is (plain PEM, backwards-compatible behaviour).
 */
export async function maybeDecryptPem(raw: string): Promise<Buffer> {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Not valid JSON — treat as plain PEM
      return Buffer.from(trimmed, "utf8");
    }
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "ciphertext" in parsed &&
      "wrappedDek" in parsed &&
      "kmsProvider" in parsed
    ) {
      const encKey = parsed as EncryptedKey;
      return decryptKey("default", encKey);
    }
  }
  return Buffer.from(trimmed, "utf8");
}
