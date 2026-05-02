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
