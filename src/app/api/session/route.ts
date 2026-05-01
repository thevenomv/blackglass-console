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

  // Verify HMAC signature when a token is present
  let authenticated = false;
  if (rawToken) {
    const payload = await verifySession(rawToken);
    authenticated = payload !== null;
  }

  let role: Role =
    cookieRole && VALID.includes(cookieRole as Role) ? (cookieRole as Role) : defaultGuestRole();

  if (!apiConfig.authRequired && !(cookieRole && VALID.includes(cookieRole as Role))) {
    role = "admin";
  }

  return NextResponse.json({
    authenticated: authenticated || !apiConfig.authRequired,
    role,
    authRequired: apiConfig.authRequired,
  });
}
