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
import type { Role } from "@/lib/auth/permissions";
import { jsonError } from "./json-error";

type GuardOk = { ok: true; role: Role };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GuardFail = { ok: false; response: ReturnType<typeof jsonError> };
export type GuardResult = GuardOk | GuardFail;

/**
 * When AUTH_REQUIRED=false the guard always passes with role=admin (dev / demo mode).
 * When AUTH_REQUIRED=true the HMAC-signed session cookie is verified and the role
 * checked against `allowed`.
 */
export async function requireRole(allowed: Role[]): Promise<GuardResult> {
  if (process.env.AUTH_REQUIRED !== "true") {
    return { ok: true, role: "admin" };
  }

  const jar = await cookies();
  const token = jar.get("bg-session")?.value;
  if (!token) {
    return { ok: false, response: jsonError(401, "unauthenticated") };
  }

  const payload = await verifySession(token);
  if (!payload) {
    return { ok: false, response: jsonError(401, "unauthenticated") };
  }

  const role = payload.role as Role;
  if (!allowed.includes(role)) {
    return { ok: false, response: jsonError(403, "forbidden") };
  }

  return { ok: true, role };
}
