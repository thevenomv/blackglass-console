# BLACKGLASS — SaaS state and roadmap

> Version: 2.0 · Last reviewed: 2026-05-07
> Audience: engineering, sales, customer-facing teams.

This document describes **what the SaaS deployment ships today** and
**what's queued next**. It replaces the previous staged "0 → 4" roadmap,
which described long-shipped capabilities (multi-tenancy, queues,
Postgres, SSO) as future work.

If you're onboarding a customer or filling in a security questionnaire,
the answers below should match exactly what reviewers find in the code.

---

## Shipped (live in production today)

### Multi-tenancy
- Single Postgres cluster shared across all SaaS tenants.
- Per-tenant isolation enforced at the database layer with
  PostgreSQL **row-level security** policies on every tenant-owned table.
- Application code sets the `app.tenant_id` GUC on every authenticated
  request via `withTenantRls()` (`src/db/index.ts`). `BYPASSRLS` is
  reserved for the migration role and inbound webhook handlers.
- Schema verification: `scripts/ops/verify-partition-integrity.mjs`.

### Identity, SSO, and access
- **Clerk Enterprise** for authentication: SAML / OIDC SSO, SCIM 2.0
  provisioning, MFA enforcement at the org level, revocable per-tenant
  API keys.
- RBAC roles enforced server-side: `viewer`, `guest_auditor`, `operator`,
  `admin`. Policy lives in `src/lib/saas/permissions.ts` and is invoked
  via `requireSaasOrLegacyPermission()`.
- See `docs/saas-clerk-rbac.md` and `docs/clerk-ops-checklist.md`.

### Workers and async work
- **BullMQ** over Redis is the spine. Three worker components run as
  separate App Platform processes:
  - `scan-worker` — SSH fan-out + drift compute.
  - `ops-worker` — outbound webhooks, exports, maintenance crons.
  - `sandbox-worker` — sandbox provision / seed / cleanup for the
    remediator's verification path.
- Retry, backoff, retention, and DLQ semantics are documented per queue
  in `docs/runbooks/operations.md`.

### Billing
- **Stripe** subscriptions with HMAC-verified webhooks.
- Webhook idempotency via `saas_webhook_idempotency` (Postgres-backed,
  not in-memory).
- Reconciliation runs daily (`npm run reconcile:billing`) to catch
  webhook gaps for both Stripe and Clerk org membership.
- Live cutover and soak procedures: `docs/stripe-live-cutover.md`,
  `docs/stripe-live-soak.md`.

### Webhooks (outbound)
- HMAC-SHA256 signed with per-tenant keys; rotation-aware (current and
  previous keys are accepted during a rollover window — see
  `ROTATION_OVERLAP_HOURS`).
- 11 destination formats supported: Slack, PagerDuty, ServiceNow, Jira,
  Datadog, Linear, GitHub Issues, Splunk HEC, AWS Security Hub (ASFF),
  Microsoft Sentinel (CEF), and OCSF 2.0 Compliance Findings — plus a
  generic signed JSON path. Routing in
  `src/lib/server/outbound-webhook.ts`.

### Audit
- Append-only `saas_audit_events` table; per-tenant filtering enforced
  by RLS.
- Quick-filters in the audit log UI for Auth / Settings / Webhooks /
  Drift.
- Deterministic NDJSON export with verifiable integrity digest:
  `npm run audit:verify-jsonl`.
- Full action constants in `src/lib/server/audit-log.ts`.

### Secrets and KMS
- Pluggable `SecretProvider`: `env`, `doppler`, `infisical`, `vault`,
  `db` (envelope-encrypted Postgres-backed credentials).
- KMS providers for the wrapping key: `local`, `vault`
  (HashiCorp Vault Transit), `awskms` (AWS KMS) — selected by
  `KMS_PROVIDER`.
- Doppler is the production secret backend for the SaaS deployment.

### Persistence and storage
- Drift events: Postgres, monthly date-range partitioned for
  retention-window drops.
- Baselines + drift history: Postgres + DigitalOcean Spaces (with
  lifecycle rules).
- Evidence bundles: DigitalOcean Spaces.
- Backup + restore drill: documented quarterly cadence with RPO/RTO
  in `docs/runbooks/operations.md`.

### Air-gapped mode
- `BLACKGLASS_AIRGAPPED=true` short-circuits all outbound public-SaaS
  dispatchers (Stripe, Sentry, telemetry, customer webhooks).
- `/api/health/airgap` exposes the flag and per-dispatcher honour state
  for monitoring infrastructure to verify.

### Self-hosted distribution
- Helm chart at `deploy/helm/blackglass/` ships `web`, `scan-worker`,
  and `ops-worker`. `sandbox-worker` is built as a separate artefact and
  documented for manual deployment (see Helm README).
- All optional integrations gated behind env vars and disabled by
  default in air-gapped mode.

### Remediator (LLM)
- Standalone Python FastAPI sidecar (`blackglass-remediator/`).
- Hard-coded risk-tier model in code, not in prompts: `safe_guidance_only`,
  `sandbox_verifiable`, `approval_required`, `manual_only`.
- Sandbox-verifiable and approval-required tiers run plans in an
  ephemeral DigitalOcean droplet that's destroyed in `finally`.
- Forbidden-command deny-list enforced before any plan reaches an
  operator.
- `requires_human_approval` is hard-coded `True` — every plan needs an
  explicit operator click.
- See `blackglass-remediator/docs/safety-model.md`.

### Observability
- Sentry server-side error capture with PII-stripping `beforeSend`,
  tagged with `tenant_id`, `user_id`, `plan`, `env`.
- Optional Sentry → PagerDuty bridge (throttled, deduplicated, gated by
  `BLACKGLASS_AIRGAPPED`).
- Optional OpenTelemetry trace export (OTLP), coexists with Sentry.

### Schema integrity
- Hash-tracked migrations via `scripts/ops/apply-migrations.mjs`
  (records every applied file's sha256 in `drizzle.__drizzle_migrations`).
- PR-time static check (`db:migrate:files`) and CI-time end-to-end
  apply (`migrations-end-to-end` job).
- Recovery from manually-applied state via `mode=baseline` in the
  `db-migrate.yml` workflow.

---

## In progress / next 1–2 quarters

- **Per-tenant CMEK / BYOK.** Today every tenant's DEK is wrapped by the
  same KMS-managed KEK; per-tenant key separation is on deck.
- **`sandbox-worker` in the Helm chart.** Currently documented for
  manual deployment; should ship as a third Deployment in `values.yaml`.
- **WORM-grade audit retention.** Customers can stream `saas_audit_events`
  to their own S3 + Object Lock bucket via the OCSF webhook; a managed
  cold-archive bucket on the SaaS side would close the loop without
  customer setup.
- **Remediator quality harness.** Canned drift scenarios under
  `blackglass-remediator/tests/scenarios/` to assert tier classification,
  forbidden-command screening, and sandbox-verification idempotency
  before every prompt or model bump (currently scaffolded; growing).
- **Per-tenant risk policies in the remediator.** Today the tier model
  is global; customers with stricter compliance regimes will want to
  push categories into `manual_only` for their tenant.
- **Static egress through a NAT gateway.** Egress IPs are exposed via
  `/api/public/egress-ips` today; pinning them behind a Floating IP
  removes the need to update the list as App Platform recycles workers.

---

## Future (no committed timeline)

- **SOC 2 attestation.** The control surface is in place and documented
  in `docs/security-compliance.md`; formal audit is in planning. Don't
  claim SOC 2 publicly until the report exists.
- **Approval quorum.** Two-of-N approver flow for `approval_required`
  remediation plans on production-tagged hosts.
- **Per-tenant model selection** for the remediator (pick model + temperature).
- **Slack approval UI** for remediations (Block Kit buttons).

---

## What this document is not

- It is **not** a sales roadmap. Sales messaging and pricing positioning
  live on the marketing pages (`/pricing`, `/security`,
  `/use-cases/...`).
- It is **not** a sprint plan. The "in progress" section reflects what
  engineering has actively committed to; the "future" section is
  intentionally undated.

---

## Related references

- `docs/architecture-overview.md` — system map and invariants.
- `docs/security-compliance.md` — control mapping for security reviewers.
- `docs/runbooks/operations.md` — DR + queues + DLQ + showcase status.
- `docs/saas-clerk-rbac.md` — RBAC + Clerk integration matrix.
- `blackglass-remediator/docs/safety-model.md` — remediator safety
  promise, in detail.
