import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Run lint in CI (verify:stage0) not during the production build — saves ~15s.
  eslint: { ignoreDuringBuilds: true },
  // Same for type errors: caught locally and in CI, not a second time on DO.
  typescript: { ignoreBuildErrors: true },
  // Exclude ssh2 (and its native modules) from webpack bundling entirely.
  // On Linux build environments the native sshcrypto.node binary is compiled
  // by npm ci; webpack cannot parse a .node binary, so we keep ssh2 as a
  // server-side CJS require rather than bundling it.
  serverExternalPackages: ["ssh2"],
};

// Wrap with Sentry only when DSN is configured — no-op otherwise.
export default withSentryConfig(nextConfig, {
  // Silence Sentry CLI output during builds unless SENTRY_LOG_LEVEL is set
  silent: !process.env.SENTRY_LOG_LEVEL,
  // Disable source map upload when no auth token is present (local dev / DO build without token)
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Disable Sentry telemetry
  telemetry: false,
});
