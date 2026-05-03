import type { Role } from "@/lib/auth/permissions";
import { verifySession } from "@/lib/auth/session-signing";
import { apiConfig, defaultGuestRole } from "@/lib/api/config";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { requireTenantAuth } from "@/lib/saas/auth-context";
import { toLegacyApiRole } from "@/lib/saas/plans";

export const dynamic = "force-dynamic";

// Roles that are valid inside a signed session token.
const VALID: Role[] = ["viewer", "auditor", "operator", "admin"];

export async function GET() {
  if (isClerkAuthEnabled()) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({
        authenticated: false,
        role: defaultGuestRole(),
        tenantRole: null,
        authRequired: true,
        clerk: true,
      });
    }
    try {
      const ctx = await requireTenantAuth();
      return NextResponse.json({
        authenticated: true,
        role: toLegacyApiRole(ctx.role),
        tenantRole: ctx.role,
        authRequired: true,
        clerk: true,
      });
    } catch {
      return NextResponse.json({
        authenticated: true,
        role: "viewer" as Role,
        tenantRole: null,
        authRequired: true,
        clerk: true,
        needsOrg: true,
      });
    }
  }

  const jar = await cookies();
  const rawToken = jar.get("bg-session")?.value;
  // NOTE: bg-role is a plain (unsigned) cookie kept only so the client can
  // show the correct UI label without an extra fetch.  It is NEVER trusted
  // for access-control decisions when AUTH_REQUIRED=true — only the
  // HMAC-signed bg-session payload is authoritative.
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
    tenantRole: null,
    authRequired: apiConfig.authRequired,
  });
}
