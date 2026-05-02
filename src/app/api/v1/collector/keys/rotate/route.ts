/**
 * POST /api/v1/collector/keys/rotate
 *
 * Placeholder for collector API-key rotation. When a real key store is
 * implemented (Doppler, Infisical, or a DB secrets table), this handler should:
 *   1. Generate a new secure random key.
 *   2. Persist the new key to the secrets backend.
 *   3. Return the new key (redacted after first display) to the caller.
 *   4. Append an audit event.
 *
 * Requires: operator or admin role.
 */

import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { jsonError } from "@/lib/server/http/json-error";
import { requireRole } from "@/lib/server/http/auth-guard";
import { checkCheckoutRate, clientIp } from "@/lib/server/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Reuse the checkout rate limit bucket (10/min/IP) — same order of magnitude.
  if (!(await checkCheckoutRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many rotation requests.");
  }

  const guard = await requireRole(["operator", "admin"]);
  if (!guard.ok) return guard.response;

  // TODO: replace with real key generation + persistence once a secrets backend
  // is wired (e.g. Doppler, Infisical, or a DB secrets table).
  appendAudit({
    action: AUDIT_ACTIONS.KEY_ROTATED,
    detail: "Collector API key rotation requested (stub — no persistent key store configured yet)",
    actor: guard.role,
  });

  return NextResponse.json({
    rotated: true,
    message: "Key rotation noted in audit log. Connect a secrets backend to enable real rotation.",
  });
}
