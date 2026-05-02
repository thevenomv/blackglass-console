import type { Role } from "@/lib/auth/permissions";
import { verifySession } from "@/lib/auth/session-signing";
import { apiConfig, defaultGuestRole } from "@/lib/api/config";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const VALID: Role[] = ["auditor", "operator", "admin"];

export async function GET() {
  const jar = await cookies();
  const rawToken = jar.get("bg-session")?.value;
  const cookieRole = jar.get("bg-role")?.value;

  // Verify HMAC signature when a token is present; role from signed payload only.
  let authenticated = false;
  let verifiedRole: Role | null = null;
  if (rawToken) {
    const payload = await verifySession(rawToken);
    if (payload !== null) {
      authenticated = true;
      verifiedRole = VALID.includes(payload.role as Role) ? (payload.role as Role) : null;
    }
  }

  let role: Role;
  if (authenticated && verifiedRole) {
    // Trust the HMAC-signed token's role, not the plain cookie.
    role = verifiedRole;
  } else if (!apiConfig.authRequired) {
    // Auth disabled: fall back to cookie role for developer convenience, default admin.
    role =
      cookieRole && VALID.includes(cookieRole as Role) ? (cookieRole as Role) : "admin";
  } else {
    role = defaultGuestRole();
  }

  return NextResponse.json({
    authenticated: authenticated || !apiConfig.authRequired,
    role,
    authRequired: apiConfig.authRequired,
  });
}
