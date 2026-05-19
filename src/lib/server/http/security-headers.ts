/**
 * Security headers applied to every Next.js response from the edge
 * middleware. Centralised here so the policy is auditable in one
 * file and a single test can lock it down.
 *
 * Defaults are tuned to be production-safe AND not break the current
 * marketing pages / Stripe / Clerk / Sentry surface area:
 *
 *   - **CSP**: shipped Report-Only for the first rollout. Set
 *     `SECURITY_HEADERS_CSP_ENFORCE=true` to flip to enforce-mode.
 *     The policy explicitly whitelists Stripe (checkout + js), Clerk
 *     (frontend + workers), Sentry's tunnel host, and Resend's
 *     pixel — anything else hits the report endpoint.
 *   - **X-Content-Type-Options: nosniff** — always on. No reason
 *     not to.
 *   - **Referrer-Policy: strict-origin-when-cross-origin** — leaks
 *     only the origin to third parties, the full path stays internal.
 *   - **Permissions-Policy** — disables camera / mic / geolocation /
 *     payment-handler / autoplay / usb. We don't use any of these.
 *   - **Cross-Origin-Opener-Policy: same-origin** — isolates the
 *     browsing context group, mitigates Spectre-class side-channels.
 *
 * NOT set here (intentional):
 *   - X-Frame-Options — superseded by `frame-ancestors` in CSP. We
 *     do set `frame-ancestors 'self'` in the CSP below.
 *   - HSTS — set at the App Platform / load balancer level so it
 *     applies even to error pages middleware doesn't touch.
 */

import type { NextRequest, NextResponse } from "next/server";

/**
 * The CSP report endpoint. Setting `SECURITY_HEADERS_CSP_REPORT_URI`
 * to a Sentry / report-uri.com / custom collector URL turns
 * violation-collection on. Empty disables the directive entirely
 * (browsers still parse the policy but discard violation reports).
 */
function cspReportUri(): string | null {
  return process.env.SECURITY_HEADERS_CSP_REPORT_URI?.trim() || null;
}

function cspEnforce(): boolean {
  // Enforce when explicitly enabled, OR when running in production and the
  // operator has NOT opted into report-only mode for gradual rollout.
  if (process.env.SECURITY_HEADERS_CSP_ENFORCE?.trim().toLowerCase() === "true") return true;
  if (process.env.NODE_ENV === "production") {
    return process.env.SECURITY_HEADERS_CSP_REPORT_ONLY?.trim().toLowerCase() !== "true";
  }
  return false;
}

/**
 * Plausible Analytics origin(s) for CSP.
 *
 * Returns the default `https://plausible.io` always (cheap to allow even
 * when analytics is disabled — no script will load), plus the host from
 * `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL` when an operator points at a self-
 * hosted instance (e.g. `https://analytics.example.com/js/script.js`).
 *
 * Defensive: bad URLs in the env var don't break the policy build —
 * they're silently dropped from the host list. The admin will see the
 * misconfiguration via a CSP violation report instead of a 500.
 */
function plausibleHosts(): string[] {
  const hosts = new Set<string>(["https://plausible.io"]);
  const overrideUrl = process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL?.trim();
  if (overrideUrl) {
    try {
      const u = new URL(overrideUrl);
      if (u.protocol === "https:" || u.protocol === "http:") {
        hosts.add(`${u.protocol}//${u.host}`);
      }
    } catch {
      // ignore unparseable override URL
    }
  }
  return Array.from(hosts);
}

/**
 * Build the CSP value. Kept in code (not env) so changes are
 * code-reviewed and travel with the deploy that needs them. Each
 * domain has a one-line comment explaining why it's on the list.
 */
function buildCsp(nonce?: string): string {
  const plausible = plausibleHosts();

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-inline' on script-src is intentional for now — Next.js
    // emits inline boot scripts. A nonce-based rollout is the proper
    // fix; tracked in src/lib/server/http/security-headers.ts. Until
    // then we accept the looser policy AND ship CSP in Report-Only
    // mode in development so we can find violations before enforcing.
    //
    // TODO: replace 'unsafe-inline' with a per-request nonce once
    // Next.js middleware nonce propagation is wired end-to-end.
    //
    // 'unsafe-eval' has been removed. Next.js 14+ no longer requires it
    // in production; Sentry source maps work without it. If a third-party
    // script re-introduces the need, add a comment here explaining why.
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      "https://js.stripe.com", // Stripe Checkout + Elements
      "https://*.clerk.accounts.dev",
      "https://*.clerk.com",
      ...plausible, // Plausible Analytics (cookie-free, marketing routes only) — see PlausibleScript.tsx
      ...(nonce ? [`'nonce-${nonce}'`] : []),
    ],
    "style-src": [
      "'self'",
      "'unsafe-inline'", // Tailwind generates inline <style> blocks for some critical-CSS scenarios
      "https://fonts.googleapis.com",
    ],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https:", // marketing pages embed third-party logos; tightenable later
    ],
    "connect-src": [
      "'self'",
      "https://api.stripe.com",
      "https://*.clerk.accounts.dev",
      "https://*.clerk.com",
      "https://*.ingest.sentry.io",
      "https://*.ingest.us.sentry.io",
      "https://*.ingest.de.sentry.io",
      "https://o4504505471565824.ingest.sentry.io",
      "wss://*.clerk.accounts.dev",
      "wss://*.clerk.com",
      ...plausible, // Plausible's `/api/event` endpoint receives custom events from trackToolEvent
    ],
    "frame-src": [
      "'self'",
      "https://js.stripe.com",
      "https://hooks.stripe.com",
      "https://*.clerk.accounts.dev",
      "https://*.clerk.com",
    ],
    "frame-ancestors": ["'self'"], // supersedes X-Frame-Options
    "form-action": ["'self'", "https://checkout.stripe.com"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "upgrade-insecure-requests": [],
  };

  const reportUri = cspReportUri();
  if (reportUri) directives["report-uri"] = [reportUri];

  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(" ")}` : k))
    .join("; ");
}

const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=(self)", // Stripe Checkout uses Payment Request API on /pricing/* and /billing
  "picture-in-picture=()",
  "publickey-credentials-get=(self)", // WebAuthn / passkeys (Clerk)
  "screen-wake-lock=()",
  "sync-xhr=(self)",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");

/**
 * Apply security headers to a NextResponse in-place AND return it
 * (for chaining). Cheap to call per-request.
 */
export function applySecurityHeaders(
  res: NextResponse,
  _request?: NextRequest,
): NextResponse {
  const headersDisabled = process.env.SECURITY_HEADERS_DISABLED === "true";

  if (headersDisabled && process.env.NODE_ENV === "production") {
    console.warn(
      "[security-headers] SECURITY_HEADERS_DISABLED=true in production. " +
        "Only CSP will be skipped; all other security headers remain active.",
    );
  }

  // These baseline headers are ALWAYS applied — SECURITY_HEADERS_DISABLED
  // only suppresses the CSP header (useful for debugging CSP violations
  // without rolling back the entire policy).
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");

  // CSP — skip entirely when SECURITY_HEADERS_DISABLED is set so operators
  // can debug CSP violations without removing all other protections.
  if (!headersDisabled) {
    const csp = buildCsp();
    if (cspEnforce()) {
      res.headers.set("Content-Security-Policy", csp);
    } else {
      res.headers.set("Content-Security-Policy-Report-Only", csp);
    }
  }

  return res;
}

/** Exported for tests — never used in the request path. */
export const __test__ = { buildCsp, PERMISSIONS_POLICY };
