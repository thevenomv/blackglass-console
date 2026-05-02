/**
 * Invite token management.
 *
 * Tokens are stored in the INVITE_TOKENS env var as a comma-separated list.
 * Example: INVITE_TOKENS=tok_abc123,tok_def456
 *
 * Each token grants a one-time read-only "viewer" session.
 * Used tokens are tracked in-memory — they reset on process restart (acceptable
 * for Stage 2; migrate to DB for Stage 3).
 *
 * Token format (new):  tok_<10-hex-expiry-seconds>_<20-byte-base64url-random>
 *   - Expiry is seconds since Unix epoch encoded as 10 lower-case hex characters.
 *   - Default TTL: 72 hours.  Configurable via INVITE_TOKEN_TTL_HOURS env var.
 *   - Old tokens without the structured prefix are still accepted (backward compat).
 *
 * Tokens should be generated with generateInviteToken() and added to INVITE_TOKENS.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// In-memory set of redeemed tokens for this process lifetime.
const redeemed = new Set<string>();

function loadTokens(): string[] {
  const raw = process.env.INVITE_TOKENS ?? "";
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Parse the embedded expiry from a new-format token.
 * Returns expiry timestamp in ms, or null if the token uses the old format.
 */
function parseTokenExpiry(token: string): number | null {
  // New format: tok_<10 lower-case hex digits>_<random>
  const m = /^tok_([0-9a-f]{10})_/.exec(token);
  if (!m) return null;
  return parseInt(m[1], 16) * 1000;
}

/**
 * Validate a candidate token in constant time.
 * Returns true if the token exists in INVITE_TOKENS, has not been redeemed,
 * and has not expired (for new-format tokens).
 */
export function validateInviteToken(candidate: string): boolean {
  if (!candidate || candidate.length < 8) return false;

  const tokens = loadTokens();
  if (tokens.length === 0) return false;

  // Check already redeemed (fast reject, not timing-sensitive)
  if (redeemed.has(candidate)) return false;

  // Check expiry encoded in token (new format only — old tokens have no expiry)
  const expMs = parseTokenExpiry(candidate);
  if (expMs !== null && Date.now() > expMs) return false;

  // Constant-time membership check across all tokens
  const enc = (s: string) => Buffer.from(s, "utf8");
  let found = false;
  for (const t of tokens) {
    // Use HMAC comparison to normalise length before timingSafeEqual
    const a = createHmac("sha256", "invite-cmp").update(enc(candidate)).digest();
    const b = createHmac("sha256", "invite-cmp").update(enc(t)).digest();
    if (timingSafeEqual(a, b)) found = true;
  }
  return found;
}

/**
 * Mark a token as redeemed so it cannot be used again within this process.
 */
export function redeemInviteToken(token: string): void {
  redeemed.add(token);
}

/**
 * Generate a new cryptographically random invite token with an embedded expiry.
 * Default TTL is 72 hours, or INVITE_TOKEN_TTL_HOURS if set.
 * Caller is responsible for adding it to INVITE_TOKENS.
 */
export function generateInviteToken(): string {
  const ttlHours = parseInt(process.env.INVITE_TOKEN_TTL_HOURS ?? "72", 10);
  const expireSec = Math.floor((Date.now() + ttlHours * 3_600_000) / 1000);
  const expHex = expireSec.toString(16).padStart(10, "0");
  return `tok_${expHex}_${randomBytes(20).toString("base64url")}`;
}
