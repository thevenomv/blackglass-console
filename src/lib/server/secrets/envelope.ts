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
 * Encrypt an SSH private key PEM for storage.
 *
 * Returns an `EncryptedKey` that can be safely stored in Postgres.
 * When KMS_PROVIDER is "none", warns and returns the key base64-encoded
 * without encryption (suitable only for development).
 */
export async function encryptKey(
  _workspaceId: string,
  pemOrBuffer: string | Buffer,
): Promise<EncryptedKey> {
  const plaintext = Buffer.isBuffer(pemOrBuffer)
    ? pemOrBuffer
    : Buffer.from(pemOrBuffer, "utf8");

  const provider = kmsProvider();

  if (provider === "none") {
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

  // 1. Generate a fresh 256-bit DEK
  const dek = randomBytes(32);

  // 2. Encrypt key material with DEK
  const ciphertext = aesEncrypt(dek, plaintext);

  // 3. Wrap the DEK with the KMS KEK
  let wrappedDek: string;
  let kmsKeyRef: string;
  if (provider === "local") {
    wrappedDek = await localWrapDek(dek);
    kmsKeyRef = localKmsKeyRef();
  } else if (provider === "vault") {
    wrappedDek = await vaultWrapDek(dek);
    kmsKeyRef = vaultTransitKeyName();
  } else if (provider === "awskms") {
    wrappedDek = await awsWrapDek(dek);
    kmsKeyRef = process.env.AWS_KMS_KEY_ID ?? "";
  } else {
    throw new Error(`Unknown KMS_PROVIDER: ${provider}. Use local, vault, or awskms.`);
  }

  // Zero-fill the DEK from memory immediately after wrapping
  dek.fill(0);

  return { ciphertext, wrappedDek, kmsProvider: provider, kmsKeyRef };
}

/**
 * Decrypt an `EncryptedKey` back to a plaintext PEM Buffer.
 * The caller is responsible for zeroing the buffer when done.
 */
export async function decryptKey(
  _workspaceId: string,
  encKey: EncryptedKey,
): Promise<Buffer> {
  const { ciphertext, wrappedDek, kmsProvider: provider } = encKey;

  if (provider === "none") {
    return Buffer.from(ciphertext, "base64");
  }

  let dek: Buffer;
  if (provider === "local") {
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
