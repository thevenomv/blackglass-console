/**
 * Reusable server-side role guard for API route handlers.
 * Returns an ok/fail discriminated union so handlers can do an early return.
 *
 * Usage:
 *   const guard = await requireRole(["operator", "admin"]);
 *   if (!guard.ok) return guard.response;
 */

import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth/session-signing";
import type { Role } from "@/lib/auth/legacy-permissions";
import { jsonError } from "./json-error";

type GuardOk = { ok: true; role: Role };
type GuardFail = { ok: false; response: ReturnType<typeof jsonError> };
export type GuardResult = GuardOk | GuardFail;

/**
 * Normalizes AUTH_REQUIRED to a boolean.
 * Truthy values: "true", "1", "yes", "on" (case-insensitive).
 * Explicit falsy: "false", "0", "no", "off".
 * In production, anything other than an explicit falsy value is treated as required (fail-closed).
 */
function isAuthRequired(): boolean {
  const raw = process.env.AUTH_REQUIRED?.toLowerCase().trim();
  const explicit = { true: true, "1": true, yes: true, on: true, false: false, "0": false, no: false, off: false };
  if (raw !== undefined && raw in explicit) {
    return explicit[raw as keyof typeof explicit];
  }
  // In production fail closed when AUTH_REQUIRED is absent or unrecognized.
  if (process.env.NODE_ENV === "production") return true;
  return false;
}

/**
 * When AUTH_REQUIRED is explicitly falsy AND not production, the guard passes in dev/demo mode.
 * In production the HMAC-signed session cookie is always verified — no admin fallback.
 */
export async function requireRole(allowed: Role[]): Promise<GuardResult> {
  if (!isAuthRequired() && process.env.NODE_ENV !== "production") {
    // Dev/demo convenience only — never granted in production.
    return { ok: true, role: "viewer" };
  }

  const jar = await cookies();
  const token = jar.get("bg-session")?.value;
  if (!token) {
    console.warn("[auth-guard] Unauthenticated: no session cookie");
    return { ok: false, response: jsonError(401, "unauthenticated") };
  }

  const payload = await verifySession(token);
  if (!payload) {
    console.warn("[auth-guard] Invalid or expired session token");
    return { ok: false, response: jsonError(401, "unauthenticated") };
  }

  const role = payload.role as Role;
  if (!allowed.includes(role)) {
    console.warn(`[auth-guard] Forbidden: role=${role} not in [${allowed.join(",")}]`);
    return { ok: false, response: jsonError(403, "forbidden") };
  }

  return { ok: true, role };
}
