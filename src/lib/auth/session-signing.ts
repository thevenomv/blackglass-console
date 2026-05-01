/**
 * HMAC-SHA256 session signing utilities.
 * Works in both Node.js and Edge (Web Crypto) runtimes.
 *
 * Token format: <base64url-payload>.<base64url-signature>
 * Payload: { role, iat }
 */

const DEV_SECRET = "dev-secret-replace-in-production";

function getSecret(): string {
  return process.env.AUTH_SESSION_SECRET ?? DEV_SECRET;
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
    return JSON.parse(payloadStr) as SessionPayload;
  } catch {
    return null;
  }
}
