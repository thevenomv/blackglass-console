import { verifySession } from "@/lib/auth/session-signing";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SESSION = "bg-session";

export async function middleware(request: NextRequest) {
  const authRequired = process.env.AUTH_REQUIRED === "true";
  if (!authRequired) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  // Invite redemption is intentionally unauthenticated — the token IS the credential
  if (pathname.startsWith("/api/auth/invite")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION)?.value;
  if (!token) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    login.searchParams.set("redirected", "1");
    return NextResponse.redirect(login);
  }

  const payload = await verifySession(token);
  if (!payload) {
    // Token present but invalid/tampered — force re-login
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    login.searchParams.set("redirected", "1");
    const response = NextResponse.redirect(login);
    response.cookies.delete(SESSION);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude Sentry tunnel, Next.js internals, static files, API routes, and public legal pages
    "/((?!monitoring|terms|privacy|pricing|_next/static|_next/image|favicon.ico|api|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
