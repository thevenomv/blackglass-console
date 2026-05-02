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
 * Tokens should be generated with `crypto.randomBytes(24).toString('base64url')`
 * and have a `tok_` prefix for easy identification.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

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
 * Validate a candidate token in constant time.
 * Returns true if the token exists in INVITE_TOKENS and has not been redeemed.
 */
export function validateInviteToken(candidate: string): boolean {
  if (!candidate || candidate.length < 8) return false;

  const tokens = loadTokens();
  if (tokens.length === 0) return false;

  // Check already redeemed (fast reject, not timing-sensitive)
  if (redeemed.has(candidate)) return false;

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
 * Generate a new cryptographically random invite token.
 * Caller is responsible for adding it to INVITE_TOKENS.
 */
export function generateInviteToken(): string {
  const { randomBytes } = require("node:crypto") as typeof import("node:crypto");
  return "tok_" + randomBytes(24).toString("base64url");
}
