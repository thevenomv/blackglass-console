import { type NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/auth/session-signing";
import { validateAndRedeemInviteToken } from "@/lib/auth/invite-tokens";
import { checkInviteRate, clientIp } from "@/lib/server/rate-limit";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";

const SESSION = "bg-session";
const ROLE = "bg-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Viewer invite sessions last 30 days (longer than admin 7-day session). */
const VIEWER_SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export async function GET(request: NextRequest) {
  // Legacy invite flow is disabled when Clerk SaaS auth is enabled.
  // Minting bg-session cookies while Clerk is active would bypass SaaS RBAC.
  // Use Clerk organization invitations for member onboarding instead.
  if (isClerkAuthEnabled()) {
    return NextResponse.json(
      { error: "gone", message: "Legacy invite links are disabled. Use Clerk organization invites instead." },
      { status: 410 },
    );
  }

  const { searchParams } = request.nextUrl;
  const token = searchParams.get("token")?.trim() ?? "";

  // Rate limit by IP — 10 attempts per minute
  const ip = clientIp(request);
  if (!(await checkInviteRate(ip))) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  // Atomically validate AND redeem — prevents TOCTOU where two parallel requests
  // both pass validation before either marks the token as redeemed.
  if (!validateAndRedeemInviteToken(token)) {
    appendAudit({ action: AUDIT_ACTIONS.INVITE_REJECTED, detail: `Invalid or expired token — IP: ${ip}`, actor: ip });
    // Redirect to login with a generic error rather than leaking token validity.
    const login = new URL("/login", request.url);
    login.searchParams.set("error", "invalid_invite");
    return NextResponse.redirect(login);
  }

  appendAudit({ action: AUDIT_ACTIONS.INVITE_REDEEMED, detail: `Invite redeemed — IP: ${ip}`, actor: ip });

  // Align session cookie TTL with the signing layer's SESSION_MAX_AGE_MS (7 days).
  // The 30-day cookie previously issued outlasted the HMAC-verified expiry window.
  const SESSION_SIGNING_TTL = 7 * 24 * 60 * 60;
  const maxAge = SESSION_SIGNING_TTL;
  const secure = process.env.NODE_ENV === "production";
  const sessionToken = await signSession({ role: "viewer", iat: Date.now() });

  const response = NextResponse.redirect(new URL("/welcome", request.url));
  response.cookies.set(SESSION, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge,
    secure,
  });
  response.cookies.set(ROLE, "viewer", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge,
    secure,
  });
  return response;
}
