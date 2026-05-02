import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Content-Security-Policy for the app shell.
// 'unsafe-inline' + 'unsafe-eval' are required by Next.js RSC hydration.
// Sentry requests are proxied via /monitoring (same-origin) — no external connect needed.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  // Prevent MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Deny framing — blocks clickjacking
  { key: "X-Frame-Options", value: "DENY" },
  // Disable legacy XSS filter (CSP is authoritative; the filter creates its own vulnerabilities)
  { key: "X-XSS-Protection", value: "0" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS — 1 year, include subdomains. Cloudflare passes this through to the client over TLS.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Lint runs via `npm run lint` / verify:stage0 / CI — not duplicated in `next build`.
  typescript: { ignoreBuildErrors: false },
  // Exclude ssh2 (and its native modules) from webpack bundling entirely.
  // On Linux build environments the native sshcrypto.node binary is compiled
  // by npm ci; webpack cannot parse a .node binary, so we keep ssh2 as a
  // server-side CJS require rather than bundling it.
  serverExternalPackages: ["ssh2", "pg", "ioredis", "bullmq"],

  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withSentryConfig(nextConfig, {
  org: "obsidian-dynamics",
  project: "javascript-nextjs",
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload a larger set of source maps for better stack traces
  widenClientFileUpload: true,

  // Proxy Sentry requests through /monitoring to bypass ad-blockers
  // (excluded from auth middleware via the matcher in middleware.ts)
  tunnelRoute: "/monitoring",

  silent: !process.env.CI,

  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});
