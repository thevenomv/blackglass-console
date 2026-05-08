/**
 * Signed Approval Token for remediation execution.
 *
 * Why this exists
 * ---------------
 * The remediator approval flow has two trust boundaries:
 *
 *   Console (human clicks Approve)        ← authoritative decision-maker
 *      │
 *      ▼
 *   Remediator API key (HMAC webhook)     ← knows about plans, can run them
 *      │
 *      ▼
 *   Sandbox / SSH execution               ← actually changes hosts
 *
 * If the remediator's API key is ever leaked or its DB is tampered
 * with, an attacker could mark an arbitrary recommendation as
 * "approved" and trigger execution. We close that gap by requiring
 * every approval the remediator acts on to be accompanied by a
 * short-lived, narrowly-scoped, HMAC-SHA256 token signed by the
 * Console with `REMEDIATOR_APPROVAL_TOKEN_SECRET`.
 *
 * The token binds:
 *   - the recommendation_id (so a token for plan X cannot run plan Y)
 *   - the tenant_id (so a leaked token from tenant A cannot approve tenant B)
 *   - the decision (`approve` | `reject`) so an attacker can't flip a
 *     reject into an approve
 *   - the actor_id of the human who clicked approve
 *   - an issued-at + expiry (short — 5 minutes by default; the
 *     remediator must consume the token immediately)
 *
 * Format (URL-safe base64url, no padding):
 *
 *   <payload>.<signature>
 *   payload   = base64url(JSON.stringify({rid, tid, dec, act, iat, exp}))
 *   signature = base64url(HMAC-SHA256(payload, secret))
 *
 * The format is deliberately NOT JWT — JWT's header/algorithm
 * negotiation is the source of half the JWT CVEs. A two-field
 * payload.signature with a fixed algorithm is simpler to audit.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApprovalDecision = "approve" | "reject";

export interface ApprovalTokenPayload {
  /** Recommendation id this token authorises a decision on. */
  rid: string;
  /** Tenant id the recommendation belongs to. Token is bound to this tenant. */
  tid: string;
  /** Decision (`approve` or `reject`). */
  dec: ApprovalDecision;
  /** Actor id of the human who made the decision in the Console. */
  act: string;
  /** Issued-at, unix-seconds. */
  iat: number;
  /** Expiry, unix-seconds. */
  exp: number;
}

export type ApprovalVerifyResult =
  | { ok: true; payload: ApprovalTokenPayload }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default lifetime — the remediator should consume the token within 5 min. */
const DEFAULT_TTL_SECONDS = 5 * 60;

/** Hard cap on TTL — anything longer than 1 h would defeat the purpose. */
const MAX_TTL_SECONDS = 60 * 60;

/** Cap on payload size to keep the URL/header reasonable. */
const MAX_PAYLOAD_BYTES = 1024;

// ---------------------------------------------------------------------------
// Helpers — base64url without padding (URL-safe, header-safe).
// ---------------------------------------------------------------------------

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function loadSecret(): string {
  const raw = process.env.REMEDIATOR_APPROVAL_TOKEN_SECRET?.trim();
  if (!raw || raw.length < 32) {
    throw new Error(
      "REMEDIATOR_APPROVAL_TOKEN_SECRET must be set and >=32 characters " +
        "(used as HMAC-SHA256 key for signing remediation approval tokens).",
    );
  }
  return raw;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mint a token authorising a single decision on a single recommendation.
 *
 * @throws when REMEDIATOR_APPROVAL_TOKEN_SECRET is unset or too short.
 */
export function signApprovalToken(args: {
  recommendationId: string;
  tenantId: string;
  decision: ApprovalDecision;
  actorId: string;
  ttlSeconds?: number;
}): string {
  const ttl = Math.min(args.ttlSeconds ?? DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS);
  const iat = nowSec();
  const payload: ApprovalTokenPayload = {
    rid: args.recommendationId,
    tid: args.tenantId,
    dec: args.decision,
    act: args.actorId,
    iat,
    exp: iat + ttl,
  };
  const secret = loadSecret();
  const payloadJson = JSON.stringify(payload);
  if (Buffer.byteLength(payloadJson, "utf8") > MAX_PAYLOAD_BYTES) {
    // Keeps headers under typical 4-8 KiB limits even with long ids.
    throw new Error("ApprovalToken payload exceeds 1 KiB");
  }
  const payloadB64 = b64urlEncode(Buffer.from(payloadJson, "utf8"));
  const sig = createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

/**
 * Verify a token. Returns `{ ok: true, payload }` on success, or
 * `{ ok: false, reason }` describing the failure WITHOUT revealing
 * which specific check failed in security-meaningful detail (the
 * `reason` is intentionally generic so it can be safely logged or
 * surfaced to the operator).
 *
 * Strict mode (default): the token's `tenantId` and `recommendationId`
 * MUST match the supplied expectations. Pass them in from the route
 * handler so a token issued for tenant A or recommendation X cannot be
 * replayed against tenant B / recommendation Y.
 */
export function verifyApprovalToken(
  token: string,
  expect: {
    recommendationId: string;
    tenantId: string;
    decision?: ApprovalDecision;
  },
): ApprovalVerifyResult {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "missing_token" };
  }
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) {
    return { ok: false, reason: "malformed_token" };
  }
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let secret: string;
  try {
    secret = loadSecret();
  } catch {
    return { ok: false, reason: "secret_not_configured" };
  }

  const expected = createHmac("sha256", secret).update(payloadB64).digest();
  let provided: Buffer;
  try {
    provided = b64urlDecode(sigB64);
  } catch {
    return { ok: false, reason: "malformed_signature" };
  }
  // timingSafeEqual rejects different-length buffers — use that as the
  // first signal so attackers can't even probe for length differences.
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: ApprovalTokenPayload;
  try {
    const raw = b64urlDecode(payloadB64).toString("utf8");
    payload = JSON.parse(raw) as ApprovalTokenPayload;
  } catch {
    return { ok: false, reason: "bad_payload" };
  }

  if (
    typeof payload.rid !== "string" ||
    typeof payload.tid !== "string" ||
    typeof payload.act !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    (payload.dec !== "approve" && payload.dec !== "reject")
  ) {
    return { ok: false, reason: "bad_payload" };
  }

  const now = nowSec();
  if (payload.exp < now) return { ok: false, reason: "expired" };
  // Reject tokens issued in the future by more than 60 s — small clock
  // skew is fine, large skew suggests tampering or an out-of-sync host.
  if (payload.iat > now + 60) return { ok: false, reason: "iat_in_future" };

  if (payload.rid !== expect.recommendationId) {
    return { ok: false, reason: "recommendation_mismatch" };
  }
  if (payload.tid !== expect.tenantId) {
    return { ok: false, reason: "tenant_mismatch" };
  }
  if (expect.decision && payload.dec !== expect.decision) {
    return { ok: false, reason: "decision_mismatch" };
  }

  return { ok: true, payload };
}

/** True when the deployment has the secret set. Used by feature flags. */
export function approvalTokensConfigured(): boolean {
  try {
    loadSecret();
    return true;
  } catch {
    return false;
  }
}
