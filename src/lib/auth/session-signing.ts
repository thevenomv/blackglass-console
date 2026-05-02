/**
 * HMAC-SHA256 session signing utilities.
 * Works in both Node.js and Edge (Web Crypto) runtimes.
 *
 * Token format: <base64url-payload>.<base64url-signature>
 * Payload: { role, iat }
 */

const DEV_SECRET = "dev-secret-replace-in-production";

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (
    !secret &&
    process.env.NODE_ENV === "production" &&
    process.env.AUTH_REQUIRED === "true"
  ) {
    throw new Error(
      "[blackglass] AUTH_SESSION_SECRET must be set when AUTH_REQUIRED=true in production. " +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return secret ?? DEV_SECRET;
}

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromB64url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface SessionPayload {
  role: string;
  iat: number;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const enc = new TextEncoder();
  const encodedPayload = b64url(enc.encode(JSON.stringify(payload)).buffer as ArrayBuffer);
  const key = await getKey(getSecret());
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(encodedPayload));
  return `${encodedPayload}.${b64url(sig)}`;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const dot = token.lastIndexOf(".");
    if (dot === -1) return null;
    const encodedPayload = token.slice(0, dot);
    const signature = token.slice(dot + 1);

    const enc = new TextEncoder();
    const key = await getKey(getSecret());
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromB64url(signature).buffer as ArrayBuffer,
      enc.encode(encodedPayload),
    );
    if (!valid) return null;

    const payloadBytes = fromB64url(encodedPayload);
    const payloadStr = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadStr) as SessionPayload;
    // Reject tokens older than SESSION_MAX_AGE_MS
    if (Date.now() - payload.iat > SESSION_MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
