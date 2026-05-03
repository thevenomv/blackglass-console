# Incident notification — x-request-id, Sentry, PagerDuty

## Request correlation

- **`middleware.ts`** stamps **`x-request-id`** (UUID) on every gated HTML request and forwards it downstream. Surface that ID in audit rows when you persist **`request_id`** (see **`docs/audit-trail.md`** — PostgreSQL sink).

## Sentry

- **CI/Doppler**: set **`SENTRY_RELEASE`** to match **`NEXT_PUBLIC_SENTRY_RELEASE`** per deploy ([`README.md`](../README.md)).
- Alerts: spike in error rate → Slack/email from Sentry dashboard.

## PagerDuty / OpsGenie

- Create **REST API** or **Events v2 integration** routing key stored as **`PD_ROUTING_KEY`** (Doppler-only). Optional future route: **`@sentry/node`** hook or Stripe webhook watchdog — not wired in OSS tree by default.

## Runbook handshake

Customer reports issue → capture **`x-request-id`** from browser devtools (response headers on the failing request under Network tab) → search Sentry + audit export by that ID → roll forward or revoke session.
