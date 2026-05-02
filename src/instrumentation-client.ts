// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Match server `SENTRY_RELEASE` — set both at build time (e.g. CI git SHA).
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.SENTRY_RELEASE,

  integrations: [Sentry.replayIntegration()],

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  enableLogs: true,

  // Record all sessions that contain an error; 0% of error-free sessions
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  sendDefaultPii: false,

  beforeSend(event) {
    // Suppress Next.js flow-control exceptions (redirect, not-found).
    const msg = (event.exception?.values?.[0]?.value ?? "");
    if (msg === "NEXT_REDIRECT" || msg === "NEXT_NOT_FOUND") return null;

    // Suppress noisy auth responses that are expected in normal operation
    // (e.g. an unauthenticated API call returning 401/403).
    // These show up as unhandled fetch rejections from React Server Components.
    if (/\b(401|403)\b.*[Uu]nauthori[sz]ed|[Ff]orbidden/.test(msg)) return null;

    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
