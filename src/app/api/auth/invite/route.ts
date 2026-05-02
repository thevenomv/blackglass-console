import { type NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/auth/session-signing";
import { validateInviteToken, redeemInviteToken } from "@/lib/auth/invite-tokens";
import { clientIp } from "@/lib/server/rate-limit";
import { checkInviteRate } from "@/lib/server/rate-limit";

const SESSION = "bg-session";
const ROLE = "bg-role";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get("token")?.trim() ?? "";

  // Rate limit by IP — 10 attempts per minute
  const ip = clientIp(request);
  if (!checkInviteRate(ip)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  if (!validateInviteToken(token)) {
    // Redirect to login with a generic error rather than leaking token validity
    const login = new URL("/login", request.url);
    login.searchParams.set("error", "invalid_invite");
    return NextResponse.redirect(login);
  }

  // Mark used — prevents replay within this process lifetime
  redeemInviteToken(token);

  const sessionToken = await signSession({ role: "viewer", iat: Date.now() });
  const maxAge = 60 * 60 * 24 * 30; // 30-day viewer session
  const secure = process.env.NODE_ENV === "production";

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
