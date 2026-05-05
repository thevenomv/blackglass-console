import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { verifySession } from "@/lib/auth/session-signing";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";

const SESSION = "bg-session";

/** Prefer upstream `x-request-id` when safe; otherwise generate (see `src/lib/server/http/request-id.ts`). */
function resolveRequestId(request: NextRequest): string {
  const raw = request.headers.get("x-request-id")?.trim();
  if (raw && /^[\w.+=/@:-]{8,256}$/.test(raw)) return raw;
  return crypto.randomUUID();
}

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
  "/changelog(.*)",
  "/demo(.*)",
  "/login(.*)",
  "/use-cases(.*)",
  "/guides(.*)",
  // All API routes manage their own auth (Clerk session, API keys, webhook sigs).
  // Marking them public here means Clerk populates auth() context without force-redirecting.
  "/api/(.*)",
]);

const clerkMw = clerkMiddleware(async (auth, request) => {
  const requestId = resolveRequestId(request);
  if (!clerkPublic(request)) {
    await auth.protect();
  }
  return withRequestId(request, requestId);
});

async function legacyMiddleware(request: NextRequest, requestId: string) {
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
    pathname.startsWith("/changelog") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/use-cases") ||
    pathname.startsWith("/guides")
  ) {
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
  const requestId = resolveRequestId(request);

  if (isClerkAuthEnabled()) {
    // Run clerkMw for ALL routes so auth() is populated in API route handlers.
    // API routes are in clerkPublic above, so Clerk won't force-redirect them.
    return clerkMw(request, event);
  }

  // Legacy (non-Clerk) mode: API routes just need request ID stamped; auth is per-route.
  if (request.nextUrl.pathname.startsWith("/api")) {
    return withRequestId(request, requestId);
  }
  return legacyMiddleware(request, requestId);
}

export const config = {
  matcher: [
    // Exclude static assets and Next internals; include `/api` so correlation ids propagate.
    "/((?!monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest|sh|txt|xml|ico|woff2?|ttf|eot)$).*)",
  ],
};
