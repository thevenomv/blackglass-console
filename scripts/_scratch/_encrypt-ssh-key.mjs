#!/usr/bin/env node
/**
 * Encrypts the current SSH_PRIVATE_KEY env var using the local AES-256-GCM KMS
 * provider (KMS_PROVIDER=local, KMS_LOCAL_SECRET must be set).
 *
 * Usage:
 *   KMS_LOCAL_SECRET=<base64> SSH_PRIVATE_KEY="$(cat key.pem)" node scripts/ops/_encrypt-ssh-key.mjs
 *   -- or --
 *   doppler run -- node scripts/ops/_encrypt-ssh-key.mjs
 *
 * Outputs the encrypted JSON blob to stdout.  Pipe it into:
 *   doppler secrets set SSH_PRIVATE_KEY="$(doppler run -- node scripts/ops/_encrypt-ssh-key.mjs)"
 */

import crypto from "crypto";

const KMS_LOCAL_SECRET = process.env.KMS_LOCAL_SECRET;
const SSH_PRIVATE_KEY  = process.env.SSH_PRIVATE_KEY;

if (!KMS_LOCAL_SECRET) throw new Error("KMS_LOCAL_SECRET not set");
if (!SSH_PRIVATE_KEY)  throw new Error("SSH_PRIVATE_KEY not set");

// If already encrypted (JSON blob), bail out to avoid double-encryption.
try {
  const parsed = JSON.parse(SSH_PRIVATE_KEY);
  if (parsed.ciphertext) {
    process.stderr.write("SSH_PRIVATE_KEY is already an EncryptedKey blob — nothing to do.\n");
    process.stdout.write(SSH_PRIVATE_KEY + "\n");
    process.exit(0);
  }
} catch { /* not JSON — good, it's a plain PEM */ }

// Generate a random DEK (32 bytes) and wrap it with the KMS master key.
const masterKey = Buffer.from(KMS_LOCAL_SECRET, "base64");
const dek       = crypto.randomBytes(32);

// Wrap DEK: encrypt DEK itself with AES-256-GCM using the master key.
const wrapIv    = crypto.randomBytes(12);
const wrapper   = crypto.createCipheriv("aes-256-gcm", masterKey, wrapIv);
const wrappedDekBuf = Buffer.concat([wrapper.update(dek), wrapper.final()]);
const wrapTag   = wrapper.getAuthTag();
const wrappedDek = JSON.stringify({
  iv:  wrapIv.toString("hex"),
  tag: wrapTag.toString("hex"),
  ct:  wrappedDekBuf.toString("hex"),
});

// Encrypt the PEM payload with the DEK.
const iv      = crypto.randomBytes(12);
const cipher  = crypto.createCipheriv("aes-256-gcm", dek, iv);
const ct      = Buffer.concat([cipher.update(SSH_PRIVATE_KEY, "utf8"), cipher.final()]);
const authTag = cipher.getAuthTag();

const blob = JSON.stringify({
  ciphertext:  ct.toString("base64"),
  iv:          iv.toString("hex"),
  authTag:     authTag.toString("hex"),
  wrappedDek:  wrappedDek,
  kmsProvider: "local",
});

process.stdout.write(blob + "\n");
