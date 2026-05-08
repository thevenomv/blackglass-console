/**
 * Lock down the security-headers policy so a regression that quietly
 * removes a directive would fail CI. The exact CSP whitelist isn't
 * frozen — but the structural commitments (X-CTO, Permissions-Policy,
 * COOP, CSP-Report-Only by default, frame-ancestors='self') are.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { applySecurityHeaders, __test__ } from "../../src/lib/server/http/security-headers";

const ORIG_DISABLED = process.env.SECURITY_HEADERS_DISABLED;
const ORIG_ENFORCE = process.env.SECURITY_HEADERS_CSP_ENFORCE;

beforeEach(() => {
  delete process.env.SECURITY_HEADERS_DISABLED;
  delete process.env.SECURITY_HEADERS_CSP_ENFORCE;
});
afterEach(() => {
  if (ORIG_DISABLED === undefined) delete process.env.SECURITY_HEADERS_DISABLED;
  else process.env.SECURITY_HEADERS_DISABLED = ORIG_DISABLED;
  if (ORIG_ENFORCE === undefined) delete process.env.SECURITY_HEADERS_CSP_ENFORCE;
  else process.env.SECURITY_HEADERS_CSP_ENFORCE = ORIG_ENFORCE;
});

describe("security headers", () => {
  it("sets the four always-on headers on every response", () => {
    const res = applySecurityHeaders(NextResponse.next());
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(res.headers.get("Permissions-Policy")).toBeTruthy();
  });

  it("Permissions-Policy disables camera / microphone / geolocation", () => {
    const res = applySecurityHeaders(NextResponse.next());
    const pp = res.headers.get("Permissions-Policy") ?? "";
    expect(pp).toMatch(/camera=\(\)/);
    expect(pp).toMatch(/microphone=\(\)/);
    expect(pp).toMatch(/geolocation=\(\)/);
    expect(pp).toMatch(/usb=\(\)/);
  });

  it("ships CSP in Report-Only mode by default", () => {
    const res = applySecurityHeaders(NextResponse.next());
    expect(res.headers.get("Content-Security-Policy-Report-Only")).toBeTruthy();
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("flips to enforced CSP when SECURITY_HEADERS_CSP_ENFORCE=true", () => {
    process.env.SECURITY_HEADERS_CSP_ENFORCE = "true";
    const res = applySecurityHeaders(NextResponse.next());
    expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
    expect(res.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
  });

  it("CSP includes frame-ancestors='self' (replaces X-Frame-Options)", () => {
    const csp = __test__.buildCsp();
    expect(csp).toMatch(/frame-ancestors 'self'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/base-uri 'self'/);
  });

  it("CSP whitelists Stripe, Clerk, and Sentry connect endpoints", () => {
    const csp = __test__.buildCsp();
    expect(csp).toMatch(/api\.stripe\.com/);
    expect(csp).toMatch(/clerk\.com/);
    expect(csp).toMatch(/sentry\.io/);
  });

  it("opting out via SECURITY_HEADERS_DISABLED skips ALL headers", () => {
    process.env.SECURITY_HEADERS_DISABLED = "true";
    const res = applySecurityHeaders(NextResponse.next());
    expect(res.headers.get("X-Content-Type-Options")).toBeNull();
    expect(res.headers.get("Permissions-Policy")).toBeNull();
    expect(res.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
  });
});
