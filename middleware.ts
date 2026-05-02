import { verifySession } from "@/lib/auth/session-signing";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SESSION = "bg-session";

export async function middleware(request: NextRequest) {
  // Generate a unique ID for this request so errors/events can be correlated
  // across middleware, route handlers, audit log, and Sentry.
  const requestId = crypto.randomUUID();

  // Build a NextResponse.next() that forwards the ID to downstream route handlers
  // (via request headers) and exposes it to clients (via response headers).
  function passthrough(): NextResponse {
    const fwdHeaders = new Headers(request.headers);
    fwdHeaders.set("x-request-id", requestId);
    const res = NextResponse.next({ request: { headers: fwdHeaders } });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const authRequired = process.env.AUTH_REQUIRED === "true";
  if (!authRequired) {
    return passthrough();
  }

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login")) {
    return passthrough();
  }

  // Invite redemption is intentionally unauthenticated — the token IS the credential
  if (pathname.startsWith("/api/auth/invite")) {
    return passthrough();
  }

  const token = request.cookies.get(SESSION)?.value;
  if (!token) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    login.searchParams.set("redirected", "1");
    const res = NextResponse.redirect(login);
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const payload = await verifySession(token);
  if (!payload) {
    // Token present but invalid/tampered — force re-login
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    login.searchParams.set("redirected", "1");
    const res = NextResponse.redirect(login);
    // Explicit attributes ensure the cookie is cleared in all browser contexts.
    res.cookies.set({ name: SESSION, value: "", maxAge: 0, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  return passthrough();
}

export const config = {
  matcher: [
    // Exclude Sentry tunnel, Next.js internals, static files, API routes, and public legal pages
    "/((?!monitoring|terms|privacy|pricing|_next/static|_next/image|favicon.ico|api|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
