// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  enableLogs: true,

  sendDefaultPii: false,

  // Next.js uses Error-based flow control for redirects and not-found.
  ignoreErrors: ["NEXT_REDIRECT", "NEXT_NOT_FOUND"],

  beforeSend(event) {
    // Drop Next.js flow-control errors that slip past ignoreErrors.
    const msg = event.exception?.values?.[0]?.value ?? "";
    if (msg === "NEXT_REDIRECT" || msg === "NEXT_NOT_FOUND") return null;

    // Health-check probes are monitored separately and are not product bugs.
    const url = event.request?.url ?? "";
    if (url.includes("/api/health")) return null;

    return event;
  },
});
