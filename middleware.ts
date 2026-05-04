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
  "/demo(.*)",
  "/login(.*)",
  "/use-cases(.*)",
  "/guides(.*)",
  // API routes that authenticate via their own mechanisms (webhook sig / collector API key)
  "/api/health(.*)",
  "/api/webhooks/(.*)",
  "/api/checkout(.*)",
  "/api/v1/ingest(.*)",
  "/api/v1/collector/(.*)",
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

  // API routes: stamp `x-request-id` for handlers and outbound error envelopes;
  // auth remains per-route (Clerk session, API keys, legacy cookie).
  if (request.nextUrl.pathname.startsWith("/api")) {
    return withRequestId(request, requestId);
  }

  if (isClerkAuthEnabled()) {
    return clerkMw(request, event);
  }
  return legacyMiddleware(request, requestId);
}

export const config = {
  matcher: [
    // Exclude static assets and Next internals; include `/api` so correlation ids propagate.
    "/((?!monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
