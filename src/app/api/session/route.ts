import type { Role } from "@/lib/auth/permissions";
import { apiConfig, defaultGuestRole } from "@/lib/api/config";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const VALID: Role[] = ["auditor", "operator", "admin"];

export async function GET() {
  const jar = await cookies();
  const authenticated = Boolean(jar.get("bg-session")?.value);
  const cookieRole = jar.get("bg-role")?.value;

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
