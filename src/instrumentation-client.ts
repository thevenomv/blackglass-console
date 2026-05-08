// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

/**
 * Air-gap guarantee on the FRONTEND.
 *
 * `BLACKGLASS_AIRGAPPED` is a server-side env, but Next.js exposes
 * env vars to the client only via `NEXT_PUBLIC_*`. We mirror the
 * setting as `NEXT_PUBLIC_BLACKGLASS_AIRGAPPED` so the client can
 * see it AND so the operator only has to flip ONE switch on the
 * deployment (see middleware.ts: when BLACKGLASS_AIRGAPPED is on the
 * Console refuses to dispatch to public SaaS, so every NEXT_PUBLIC
 * mirror should also be set).
 *
 * In air-gapped mode we still call `Sentry.init` — that's required
 * so any local code calling `Sentry.captureException` doesn't throw
 * — but we set `enabled: false` AND drop every event in beforeSend
 * so absolutely nothing leaves the browser. Replay integration is
 * also dropped from the integrations list so session recordings
 * never start.
 */
function isAirgappedClient(): boolean {
  const raw = process.env.NEXT_PUBLIC_BLACKGLASS_AIRGAPPED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

const airgapped = isAirgappedClient();

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // When the deployment is air-gapped we explicitly disable the SDK.
  // This prevents the network beacon, pageload transactions, and
  // session-replay buffer from ever firing.
  enabled: !airgapped,

  // Match server `SENTRY_RELEASE` — set both at build time (e.g. CI git SHA).
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.SENTRY_RELEASE,

  // Drop replayIntegration entirely in air-gapped mode — session
  // recordings include DOM contents and would be the highest-impact
  // privacy leak if sent. Belt-and-braces alongside enabled:false.
  integrations: airgapped ? [] : [Sentry.replayIntegration()],

  tracesSampleRate: airgapped ? 0 : (process.env.NODE_ENV === "development" ? 1.0 : 0.1),

  enableLogs: !airgapped,

  // Record all sessions that contain an error; 0% of error-free sessions
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: airgapped ? 0 : 1.0,

  sendDefaultPii: false,

  beforeSend(event) {
    // Air-gapped mode: drop ABSOLUTELY everything before transport.
    // This is a hard guarantee independent of `enabled: false` so
    // a future code path that ignores the enabled flag still can't
    // exfiltrate events.
    if (airgapped) return null;

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
