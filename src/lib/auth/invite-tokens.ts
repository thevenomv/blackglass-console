/**
 * Invite token management.
 *
 * **New (default):** HMAC-signed tokens (`iv1.*`) — generated links work immediately; no env allowlist.
 * Uses INVITE_SIGNING_SECRET if set, otherwise AUTH_SESSION_SECRET, otherwise a dev default.
 *
 * **Legacy:** Comma-separated INVITE_TOKENS for unstructured `tok_*` allowlist tokens (Stage 2).
 *
 * Each successful redemption grants a one-time read-only "viewer" session.
 * Used tokens are tracked in-memory — they reset on process restart (acceptable
 * for Stage 2; migrate to DB for Stage 3).
 *
 * Signed token TTL: INVITE_TOKEN_TTL_HOURS (default 72). Link expiry is independent of the
 * 30-day viewer cookie issued after redemption (see invite route).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const IV1_PREFIX = "iv1.";

const DEV_INVITE_SECRET = "dev-secret-replace-in-production";

// In-memory set of redeemed tokens for this process lifetime.
const redeemed = new Set<string>();

function getInviteSecret(): string {
  const secret =
    process.env.INVITE_SIGNING_SECRET?.trim() ||
    process.env.AUTH_SESSION_SECRET?.trim() ||
    "";
  if (
    !secret &&
    process.env.NODE_ENV === "production" &&
    process.env.AUTH_REQUIRED === "true"
  ) {
    throw new Error(
      "[blackglass] AUTH_SESSION_SECRET (or INVITE_SIGNING_SECRET) must be set when AUTH_REQUIRED=true in production — required for signed invite links.",
    );
  }
  return secret || DEV_INVITE_SECRET;
}

/** TTL for the invite *link* (hours until the token expires if unused). */
export function getInviteTokenTtlHours(): number {
  const rawTtl = process.env.INVITE_TOKEN_TTL_HOURS?.trim();
  if (rawTtl && /^\d+$/.test(rawTtl) && parseInt(rawTtl, 10) > 0) {
    return parseInt(rawTtl, 10);
  }
  if (rawTtl && !/^\d+$/.test(rawTtl)) {
    console.warn(`[invite-tokens] INVITE_TOKEN_TTL_HOURS="${rawTtl}" is not a positive integer — using 72h.`);
  }
  return 72;
}

function loadLegacyAllowlist(): string[] {
  const raw = process.env.INVITE_TOKENS ?? "";
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Parse the embedded expiry from a legacy new-format token.
 * Returns expiry timestamp in ms, or null if the token uses the old unstructured format.
 */
function parseLegacyTokenExpiry(token: string): number | null {
  const m = /^tok_([0-9a-f]{10})_/.exec(token);
  if (!m) return null;
  return parseInt(m[1], 16) * 1000;
}

function validateLegacyAllowlistToken(candidate: string): boolean {
  const tokens = loadLegacyAllowlist();
  if (tokens.length === 0) return false;

  const expMs = parseLegacyTokenExpiry(candidate);
  if (expMs !== null && Date.now() > expMs) return false;

  const enc = (s: string) => Buffer.from(s, "utf8");
  let found = false;
  for (const t of tokens) {
    const a = createHmac("sha256", "invite-cmp").update(enc(candidate)).digest();
    const b = createHmac("sha256", "invite-cmp").update(enc(t)).digest();
    if (timingSafeEqual(a, b)) found = true;
  }
  return found;
}

interface Iv1Payload {
  exp: number;
  jti: string;
}

function validateIv1Token(candidate: string): boolean {
  if (!candidate.startsWith(IV1_PREFIX)) return false;
  const rest = candidate.slice(IV1_PREFIX.length);
  const dot = rest.lastIndexOf(".");
  if (dot === -1) return false;
  const encPayload = rest.slice(0, dot);
  const sigB64 = rest.slice(dot + 1);
  if (!encPayload || !sigB64) return false;

  let sig: Buffer;
  try {
    sig = Buffer.from(sigB64, "base64url");
  } catch {
    return false;
  }

  const secret = getInviteSecret();
  const expected = createHmac("sha256", secret).update(encPayload).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return false;

  let json: string;
  try {
    json = Buffer.from(encPayload, "base64url").toString("utf8");
  } catch {
    return false;
  }

  let data: Iv1Payload;
  try {
    data = JSON.parse(json) as Iv1Payload;
  } catch {
    return false;
  }
  if (typeof data.exp !== "number" || typeof data.jti !== "string") return false;
  if (data.jti.length < 8 || data.jti.length > 128) return false;
  if (Date.now() > data.exp * 1000) return false;

  return true;
}

/**
 * Validate a candidate token in constant time (legacy path uses HMAC-equality loop).
 * Accepts signed `iv1.*` tokens or legacy allowlist `tok_*` entries.
 */
export function validateInviteToken(candidate: string): boolean {
  if (!candidate || candidate.length < 8) return false;
  if (redeemed.has(candidate)) return false;

  if (candidate.startsWith(IV1_PREFIX)) {
    try {
      return validateIv1Token(candidate);
    } catch {
      return false;
    }
  }

  return validateLegacyAllowlistToken(candidate);
}

/**
 * Mark a token as redeemed so it cannot be used again within this process.
 */
export function redeemInviteToken(token: string): void {
  redeemed.add(token);
}

/**
 * Generate a new HMAC-signed invite token (no INVITE_TOKENS update required).
 */
export function generateInviteToken(): string {
  const ttlHours = getInviteTokenTtlHours();
  const exp = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  const jti = randomBytes(16).toString("base64url");
  const payload = JSON.stringify({ exp, jti } satisfies Iv1Payload);
  const encPayload = Buffer.from(payload, "utf8").toString("base64url");
  const secret = getInviteSecret();
  const sig = createHmac("sha256", secret).update(encPayload).digest("base64url");
  return `${IV1_PREFIX}${encPayload}.${sig}`;
}
