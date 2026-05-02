// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Tie errors to the deployed commit so Sentry release health works.
  // Set SENTRY_RELEASE=<git-sha> in Doppler stg/prod.
  release: process.env.SENTRY_RELEASE,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Attach local variable values to stack frames for better debugging
  includeLocalVariables: true,

  enableLogs: true,

  sendDefaultPii: false,

  // Next.js uses Error-based flow control for redirects and not-found — these
  // are not bugs and should not appear in Sentry.
  ignoreErrors: ["NEXT_REDIRECT", "NEXT_NOT_FOUND"],

  beforeSend(event, hint) {
    // Belt-and-suspenders: drop Next.js flow-control errors even if ignoreErrors
    // doesn't catch them (they can appear with different message shapes).
    const err = hint.originalException;
    if (err instanceof Error) {
      if (err.message === "NEXT_REDIRECT" || err.message === "NEXT_NOT_FOUND") {
        return null;
      }
    }

    // Health-check endpoint noise — errors here are almost always infra probes
    // and are already monitored via the /api/health endpoint itself.
    const url = event.request?.url ?? "";
    if (url.includes("/api/health")) return null;

    return event;
  },
});
