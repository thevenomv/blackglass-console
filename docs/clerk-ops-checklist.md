# Clerk dashboard checklist (ops)

Use this when onboarding a new BLACKGLASS production instance.

1. **Organizations** enabled — workspace = org; users have no SaaS access without membership.
2. **MFA** — Require MFA instance-wide; prefer TOTP, SMS fallback only, backup codes on.
3. **Attack protection** — Enable bot / abuse controls per Clerk recommendations.
4. **JWT / session template** (if using `CLERK_REQUIRE_STEP_UP=true`) — expose **`fva`** (factor verification age in seconds) for `requireRecentPrimaryVerification()`.
5. **Webhooks** — `POST /api/webhooks/clerk` with signing secret in `CLERK_WEBHOOK_SECRET`; subscribe to org + membership events (see `docs/saas-clerk-rbac.md`).
6. **Allowed origins / redirect URLs** — Include production `NEXT_PUBLIC_APP_URL` paths for sign-in, sign-up, and billing return URLs.

Rotate any publishable or secret key exposed in chat or tickets.
