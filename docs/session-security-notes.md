# Session & CSRF notes (console + SaaS)

- **Clerk** — Hosted session cookies are `HttpOnly` and managed by Clerk; do not build parallel username/password flows that weaken MFA posture.
- **Session fixation** — Always create sessions only after successful primary authentication (Clerk and legacy login actions already issue new session material; do not recycle pre-login tokens as authenticated sessions).
- **Legacy `bg-session`** — `httpOnly`, `sameSite=lax`, `secure` in production (see `src/app/(auth)/login/actions.ts`).
- **CSRF** — Browser-initiated `POST` to same-site routes rely on same-site cookies; privileged server actions should stay minimal and always re-validate tenant context server-side. Cross-origin `POST` from untrusted sites cannot read responses when CORS is closed, but still avoid making `GET` routes perform destructive work. Prefer `POST` + CSRF token only if you expose cookie-authenticated form endpoints to foreign origins (this app does not).
- **Invite tokens** — `GET /api/auth/invite` uses constant-time invalid token handling + rate limits; never echo raw token validity to clients.
- **Stripe portal** — In Clerk mode, `POST /api/checkout/portal` requires `billing.manage`, optional step-up, and matches Stripe customer ID to `saas_subscriptions.stripe_customer_id` when set.
