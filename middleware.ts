import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { verifySession } from "@/lib/auth/session-signing";
import { isClerkAuthEnabled } from "@/lib/saas/clerk-mode";
import { applySecurityHeaders } from "@/lib/server/http/security-headers";

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
  return applySecurityHeaders(res, request);
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
  "/changelog(.*)",
  "/contact-sales(.*)",
  "/docs(.*)",
  "/status(.*)",
  "/subprocessors(.*)",
  "/tools(.*)",
  "/recover(.*)",
  "/passphrase-recovery(.*)",
  "/vs(.*)",
  "/blog(.*)",
  "/glossary(.*)",
  // Truly-public API paths only. Clerk populates auth() context for all /api/* routes
  // but only force-redirects paths NOT listed here. Each protected handler must still
  // call requireTenantAuth / requireSaasOrLegacyPermission — this list is not the sole gate.
  "/api/webhooks/(.*)",         // Stripe / Clerk webhooks — verified by payload signature
  "/api/checkout/webhook(.*)",  // Stripe checkout webhook — verified by payload signature
  "/api/health(.*)",            // Health & liveness probes
  "/api/status",                // Public status endpoint
  "/api/auth/invite(.*)",       // Invite redemption — token verified inside handler
  "/api/public/(.*)",           // Explicitly public endpoints (egress IPs, demo data, etc.)
  "/api/session",               // Returns {authenticated:false} for guests — must run unauthenticated
  "/api/contact-sales(.*)",     // Public lead-capture form
  "/api/tools/(.*)",            // Public tool endpoints (cloud waste report, etc.)
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
    pathname.startsWith("/guides") ||
    pathname.startsWith("/changelog") ||
    pathname.startsWith("/contact-sales") ||
    pathname.startsWith("/docs") ||
    pathname.startsWith("/status") ||
    pathname.startsWith("/subprocessors") ||
    pathname.startsWith("/tools") ||
    pathname.startsWith("/recover") ||
    pathname.startsWith("/passphrase-recovery") ||
    pathname.startsWith("/vs") ||
    pathname.startsWith("/blog") ||
    pathname.startsWith("/glossary")
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
    return applySecurityHeaders(res, request);
  }

  const payload = await verifySession(token);
  if (!payload) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    login.searchParams.set("redirected", "1");
    const res = NextResponse.redirect(login);
    // Mirror the exact attributes used when setting the cookie so browsers
    // reliably clear httpOnly cookies (missing httpOnly on delete is ignored by
    // some browsers, leaving a stale session cookie in place).
    res.cookies.set({
      name: SESSION,
      value: "",
      maxAge: 0,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    res.headers.set("x-request-id", requestId);
    return applySecurityHeaders(res, request);
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
