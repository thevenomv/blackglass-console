# Incident notification — x-request-id, Sentry, PagerDuty

## Request correlation

- **`middleware.ts`** stamps **`x-request-id`** (UUID) on every gated HTML request and forwards it downstream. Surface that ID in audit rows when you persist **`request_id`** (see **`docs/architecture/audit-trail.md`** — PostgreSQL sink).

## Sentry

- **CI/Doppler**: set **`SENTRY_RELEASE`** to match **`NEXT_PUBLIC_SENTRY_RELEASE`** per deploy ([`README.md`](../README.md)).
- Alerts: spike in error rate → Slack/email from Sentry dashboard.

## PagerDuty / OpsGenie

- Create a **PagerDuty Events API v2** integration; store the routing key as **`PD_ROUTING_KEY`** (Doppler).
- The **Sentry → PagerDuty bridge** is shipped: set `PD_SENTRY_BRIDGE_ENABLED=true` to page on Sentry server errors. Throttling and dedup live in `src/lib/server/sentry-pagerduty.ts`. The bridge is automatically short-circuited when `BLACKGLASS_AIRGAPPED=true`.
- The Helm chart wires both env vars (see `deploy/helm/blackglass/README.md`).

## Runbook handshake

Customer reports issue → capture **`x-request-id`** from browser devtools (response headers on the failing request under Network tab) → search Sentry + audit export by that ID → roll forward or revoke session.
