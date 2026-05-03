import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { verifySession } from "@/lib/auth/session-signing";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";

const SESSION = "bg-session";

function withRequestId(request: NextRequest, requestId: string): NextResponse {
  const fwdHeaders = new Headers(request.headers);
  fwdHeaders.set("x-request-id", requestId);
  const res = NextResponse.next({ request: { headers: fwdHeaders } });
  res.headers.set("x-request-id", requestId);
  return res;
}

const clerkPublic = createRouteMatcher([
  "/",
  "/product(.*)",
  "/.well-known(.*)",
  "/security(.*)",
  "/book(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/terms(.*)",
  "/privacy(.*)",
  "/dpa(.*)",
  "/pricing(.*)",
  "/pricing/success(.*)",
  "/demo(.*)",
  "/login(.*)",
]);

const clerkMw = clerkMiddleware(async (auth, request) => {
  const requestId = crypto.randomUUID();
  if (!clerkPublic(request)) {
    await auth.protect();
  }
  return withRequestId(request, requestId);
});

async function legacyMiddleware(request: NextRequest) {
  const requestId = crypto.randomUUID();

  const authRequired = process.env.AUTH_REQUIRED === "true";
  if (!authRequired) {
    return withRequestId(request, requestId);
  }

  const { pathname } = request.nextUrl;
  if (
    pathname === "/" ||
    pathname.startsWith("/product") ||
    pathname.startsWith("/.well-known") ||
    pathname.startsWith("/demo") ||
    pathname.startsWith("/security") ||
    pathname.startsWith("/book") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/dpa") ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/login")
  ) {
    return withRequestId(request, requestId);
  }

  if (pathname.startsWith("/api/auth/invite")) {
    return withRequestId(request, requestId);
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
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    login.searchParams.set("redirected", "1");
    const res = NextResponse.redirect(login);
    res.cookies.set({
      name: SESSION,
      value: "",
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  return withRequestId(request, requestId);
}

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  if (isClerkAuthEnabled()) {
    return clerkMw(request, event);
  }
  return legacyMiddleware(request);
}

export const config = {
  matcher: [
    "/((?!monitoring|terms|privacy|dpa|pricing|_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
