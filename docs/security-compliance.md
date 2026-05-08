# BLACKGLASS — Security & Compliance Reference

> Version: 1.0 · Last reviewed: 2026-05-07
> Audience: customer security reviewers, procurement, internal SOC 2 prep.

This document maps the BLACKGLASS implementation to the standard
checklist questions that show up in SaaS security questionnaires
(SOC 2, ISO 27001, internal vendor reviews). Each row points at the
**actual code or configuration** that backs the claim, so a reviewer
can verify it independently rather than taking marketing's word for it.

If you are filling in a customer questionnaire and a row below answers
their question, link them straight to that section.

---

## 1. Auth & IAM

| Control                                | Implementation                                                            | Verify here                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| SAML SSO (Enterprise)                  | Clerk Enterprise SAML — surfaced in BLACKGLASS console                    | `src/app/api/v1/settings/sso/route.ts`, `src/app/(app)/settings/_components/SsoSection.tsx` |
| SCIM 2.0 user provisioning             | Clerk Enterprise SCIM — bearer-token issued per organisation              | `src/app/api/v1/settings/scim/route.ts`, `src/app/(app)/settings/_components/ScimSection.tsx` |
| MFA enforcement                        | Enforced at the Clerk org level (admin policy)                            | Clerk dashboard → Org → "Require MFA"                                                       |
| Role-based access control (RBAC)       | Three roles — `viewer`, `operator`, `admin` — checked per route           | `src/lib/saas/permissions.ts`, `requireSaasOrLegacyPermission()`                            |
| API keys (programmatic access)         | Per-tenant, hashed at rest, revocable, scoped to a role                   | `src/lib/server/services/api-key-service.ts`, `src/app/(app)/settings/_components/ApiKeysSection.tsx` |
| Session signing                        | HMAC-signed session cookies in legacy mode; Clerk JWTs in Clerk mode      | `src/lib/auth/session-signing.ts`, `middleware.ts`                                          |
| Audit of SSO logins                    | `auth.sso_login` audit row emitted per Clerk session.created webhook      | `src/app/api/webhooks/clerk/route.ts` (case `session.created`)                              |
| Audit of SCIM provisioning             | `auth.scim_provisioned` audit row emitted on Clerk user.created heuristic | `src/app/api/webhooks/clerk/route.ts` (case `user.created`)                                 |

---

## 2. Data isolation (multi-tenancy)

| Control                                  | Implementation                                                                                | Verify here                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Postgres Row-Level Security (RLS)        | `drift_events`, `saas_*` tables enforce `tenant_id = current_setting('app.current_tenant')`   | `drizzle/0003_drift_events_partition.sql`, every `saas_*` migration                |
| Per-request tenant context binding       | `withTenantRls(tenantId, fn)` issues `SET LOCAL app.current_tenant` before the query           | `src/db/index.ts`                                                                  |
| No `BYPASSRLS` outside migrations        | App role lacks the `BYPASSRLS` attribute; only the migration role has it                       | App role created with default rights — see `drizzle/0000_init_saas_schema.sql`     |
| Tenant scoping on every API route        | `requireSaasOrLegacyPermission` returns the tenant id; queries are wrapped in `withTenantRls`  | Grep for `requireSaasOrLegacyPermission(`                                          |
| Partition integrity verification         | `scripts/ops/verify-partition-integrity.mjs` confirms RLS is on and partitions are healthy     | Run weekly via cron or before/after a migration                                    |

---

## 3. Data protection (in transit & at rest)

| Control                                | Implementation                                                                       | Verify here                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| TLS 1.3 in transit                     | DigitalOcean App Platform terminates TLS at the edge; HTTP redirects to HTTPS          | `next.config.ts` HSTS header (`max-age=31536000; includeSubDomains`)              |
| Envelope encryption for SSH creds      | Per-tenant DEK wrapped by KMS-managed KEK; ciphertext stored in Postgres                | `src/lib/server/secrets/envelope.ts`, `src/lib/server/secrets/`                    |
| KMS provider abstraction               | Pluggable via `KMS_PROVIDER`: `local` (default), `vault` (HashiCorp Vault Transit), `awskms` (AWS KMS) | `src/lib/server/secrets/envelope.ts` (`kmsProvider()`)                            |
| Per-tenant rotated webhook signing     | HMAC-SHA256 with current + previous key window for graceful rotation                  | `drizzle/0013_webhook_signing_keys.sql`, `src/lib/server/services/notifications-service.ts` |
| Drift events at rest in Postgres       | DigitalOcean Managed Postgres with provider-managed encryption                          | DigitalOcean dashboard → DB cluster → Encryption                                   |
| Spaces (object storage) at rest        | Provider-managed encryption on the Spaces bucket                                       | DigitalOcean dashboard → Spaces → Encryption                                       |
| Secrets at rest in env                 | Pulled from Doppler / DO App Spec env, never committed                                 | `.env.example` documents the surface; no `.env` is checked in                      |

---

## 4. Logging & audit

| Control                                | Implementation                                                                  | Verify here                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Append-only audit table                | `saas_audit_events` — every privileged action logged with actor + target         | `src/db/schema.ts` (`saasAuditEvents`), `src/lib/server/audit-log.ts`              |
| Per-tenant audit filtering             | Audit page is RLS-scoped — operators only see their own org                      | `src/app/(app)/audit/_components/AuditLogView.tsx`                                |
| Audit of remediation lifecycle         | `remediation.requested`, `tier_classified`, `plan_generated`, `approved`, etc. | `blackglass-remediator/docs/safety-model.md` § 6                                   |
| Audit quick-filters                    | "Auth", "Settings", "Webhooks", "Drift" pills on the audit log UI                | `src/app/(app)/audit/_components/AuditLogView.tsx` (`QUICK_ACTIONS`)              |
| Action constants centralised           | `SaasAuditAction` enum prevents typo'd action strings polluting the table         | `src/lib/server/audit-log.ts`                                                     |
| Sentry server-side error capture       | Errors with PII-stripping `beforeSend`; tunnel through `/monitoring`              | `sentry.server.config.ts`                                                          |
| Optional Sentry → PagerDuty bridge     | Throttled, deduplicated, gated by `BLACKGLASS_AIRGAPPED`                          | `src/lib/server/sentry-pagerduty.ts`                                              |
| Optional OpenTelemetry trace export    | OTLP via `OTEL_EXPORTER_OTLP_ENDPOINT`; coexists with Sentry                      | `src/lib/observability/otel.ts`, `src/instrumentation.ts`                          |

---

## 5. Network & response hardening

| Header / control                       | Value                                                                                  | Verify here                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Content-Security-Policy                | Strict default-src 'self'; Stripe / Clerk / Cloudflare Turnstile allow-listed          | `next.config.ts` (`csp`)                                                          |
| HSTS                                   | `max-age=31536000; includeSubDomains`                                                  | `next.config.ts` (`securityHeaders`)                                              |
| X-Content-Type-Options                 | `nosniff`                                                                               | `next.config.ts`                                                                  |
| X-Frame-Options                        | `DENY`                                                                                  | `next.config.ts`                                                                  |
| Referrer-Policy                        | `strict-origin-when-cross-origin`                                                       | `next.config.ts`                                                                  |
| Permissions-Policy                     | camera, microphone, geolocation, payment, USB, FLoC all disabled                       | `next.config.ts`                                                                  |
| Cross-Origin-Opener-Policy             | `same-origin-allow-popups` (allow Clerk OAuth pop-ups)                                 | `next.config.ts`                                                                  |
| Cross-Origin-Resource-Policy           | `same-origin`                                                                           | `next.config.ts`                                                                  |
| Rate limiting                          | Redis-backed sliding window, per-IP + per-tenant budgets                                | `src/lib/server/rate-limit.ts`, `docs/http-rate-limit-budgets.md`                 |
| Air-gapped install mode                | `BLACKGLASS_AIRGAPPED=true` short-circuits all outbound public-SaaS dispatchers        | `src/lib/server/airgap.ts`, `src/app/api/health/airgap/route.ts`                  |
| Egress IPs published                   | `GET /api/public/egress-ips` for customer firewall automation                            | `src/app/api/public/egress-ips/route.ts`                                          |

---

## 6. CI/CD & supply chain

| Control                                | Implementation                                                                  | Verify here                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Dependency vulnerability scanning      | Dependabot watches `package.json` + Python `requirements.txt`                    | `.github/dependabot.yml`                                                          |
| Static analysis (SAST)                 | TypeScript strict mode + ESLint (incl. `react-hooks`, `security`)                | `tsconfig.json`, `eslint.config.mjs`                                              |
| Secret scanning                        | GitHub native push protection; `gitleaks` recommended for self-hosted forks      | GitHub repo → Security → Secret scanning                                          |
| Lockfile hygiene                       | `package-lock.json` committed; `npm ci` used in production builds                | `scripts/build-worker.mjs`, DO App Spec                                           |
| Pre-commit gates                       | `npm run lint && npm run typecheck && npx vitest run` required before push       | `docs/release-checklist.md`                                                       |
| Container image hardening              | Helm chart pins images, runs as non-root with read-only root FS                   | `deploy/helm/blackglass/values.yaml`, `web-deployment.yaml`                       |

---

## 7. Reliability, DR, and incident response

| Control                                | Implementation                                                                  | Verify here                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Health probes                          | `/api/health` (full), `/api/health/airgap` (air-gap manifest)                    | `src/app/api/health/route.ts`, `src/app/api/health/airgap/route.ts`               |
| Postgres backup cadence                | DigitalOcean Managed Postgres daily snapshots, 7-day retention                   | `docs/runbooks/operations.md` § Backup & Restore                                  |
| Spaces backup cadence                  | DO Spaces with versioning enabled                                                | `docs/runbooks/operations.md` § Backup & Restore                                  |
| Restore drill cadence                  | Quarterly restore-to-staging drill                                                | `docs/runbooks/operations.md` § Restore Drill                                     |
| Queue retry/backoff documented         | BullMQ exponential backoff; documented per queue                                 | `docs/runbooks/operations.md` § Queues                                            |
| Dead-letter behaviour documented       | Failed jobs land in `*.dlq`; operator alerted via Sentry / PagerDuty             | `docs/runbooks/operations.md` § Dead-Letter Queues                                |
| Partition integrity verification       | `scripts/ops/verify-partition-integrity.mjs` covers RLS + partition health       | Documented in `docs/runbooks/operations.md`                                       |
| Incident notification policy           | Customer-facing incident notification SLA + template                              | `docs/incident-notification.md`                                                   |

---

## 8. AI / Remediator governance

| Control                                | Implementation                                                                  | Verify here                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Hard-coded risk-tier model             | Application logic, not prompt instructions                                       | `blackglass-remediator/app/agent/risk_policy.py`                                  |
| Forbidden-command deny-list            | Substring match against destructive patterns; enforced before operator sees the plan | `risk_policy.py::FORBIDDEN_COMMAND_PATTERNS`                                       |
| Sandbox verification                   | Ephemeral DigitalOcean droplet, destroyed in `finally`                            | `blackglass-remediator/app/sandbox/`                                              |
| Human-in-the-loop guarantee            | `requires_human_approval` hard-coded `True`; operator approval recorded with plan hash | `blackglass-remediator/docs/safety-model.md`                                       |
| Air-gapped LLM                         | Ollama local model — no outbound LLM provider dependency                          | `blackglass-remediator/app/llm/`                                                  |
| Confidence threshold                   | `REMEDIATOR_MIN_CONFIDENCE` env var; plans below the threshold are dropped         | `blackglass-remediator/app/agent/scoring.py`                                       |

---

## 8a. Schema integrity & migration governance

| Control                                  | Implementation                                                                                                              | Verify here                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Versioned, hash-tracked migrations       | `scripts/ops/apply-migrations.mjs` records every applied file's sha256 in `drizzle.__drizzle_migrations`                    | `scripts/ops/apply-migrations.mjs`                                                |
| Idempotent migrations                    | Every prod migration uses `IF NOT EXISTS` / `ON CONFLICT` / `DO $$ ... $$` guards so re-runs are no-ops                     | `drizzle/*.sql`                                                                   |
| Static layout check (PR-time)            | `db:migrate:files` enforces 4-digit prefixes, no gaps, no duplicate hashes, valid UTF-8                                     | `scripts/ops/check-migration-files.mjs`, `package.json` (`verify:stage0`)         |
| End-to-end check (CI-time)               | `migrations-end-to-end` job boots fresh Postgres, applies every migration, verifies idempotency and `db:migrate:check` clean | `.github/workflows/ci.yml`                                                        |
| Production runs are auditable + scoped   | `db-migrate.yml` workflow opens DO DB firewall to the runner IP, runs the migrator, closes it (`if: always`)                | `.github/workflows/db-migrate.yml`                                                 |
| Recovery from manually-applied state     | `apply-migrations.mjs --baseline` records every file as "applied" without running it, for adopting drifted databases        | `scripts/ops/apply-migrations.mjs` (look for `FLAG_BASELINE`)                     |
| Migration role separation                | Only the migration role has `BYPASSRLS`; the application role does not                                                       | `drizzle/0000_init_saas_schema.sql`                                                |
| Drift incident post-mortem (May 2026)    | Captured in operations runbook; controls above are the response                                                              | `docs/runbooks/operations.md` (§ 4a)                                              |

**Why this matters for buyers:** The ability to reason about "what
schema is actually in production right now?" is a foundational
compliance question. SOC 2 CC8.1 (change management) and ISO 27001 A.14
both require evidence of a controlled change pipeline. The combination
of (hash-tracked bookkeeping) + (PR-time check) + (CI-time end-to-end
check) + (manual workflow that uses the same code) is that evidence.

---

## 9. Vendor / sub-processor list

See [`docs/vendor-inventory.md`](./vendor-inventory.md) for the full
list of third-party services that may receive customer data, what data
they receive, and how to contact their DPA.

The short version: BLACKGLASS uses **DigitalOcean** (compute + DB + object
storage), **Clerk** (auth, optional), **Stripe** (billing, optional),
**Sentry** (errors, optional), **Resend** (transactional email, optional),
and **PagerDuty** (alerting, optional). Everything except DigitalOcean
can be disabled or replaced with self-hosted equivalents. In
`BLACKGLASS_AIRGAPPED=true` mode, all outbound integrations are
short-circuited at dispatch time.

---

## 10. Buyer questionnaire quick-answers

For the most common questions:

> **Q: Do you support SSO?**
> A: Yes — SAML via Clerk Enterprise. See `src/app/api/v1/settings/sso/route.ts`.

> **Q: Do you support SCIM provisioning?**
> A: Yes — SCIM 2.0 via Clerk Enterprise. See `src/app/api/v1/settings/scim/route.ts`.

> **Q: Where is data encrypted?**
> A: At rest (provider-managed Postgres + Spaces encryption + envelope
> encryption for SSH creds). In transit (TLS 1.3 + HSTS).

> **Q: How are tenants isolated?**
> A: Postgres RLS at the row level, tenant context bound via
> `SET LOCAL app.current_tenant` per request. Verified by
> `scripts/ops/verify-partition-integrity.mjs`.

> **Q: What logs are retained, and for how long?**
> A: `saas_audit_events` for the lifetime of the tenant; `drift_events`
> partitioned monthly with operator-configurable retention; HTTP request
> logs in DigitalOcean App Platform with provider default retention.

> **Q: Can we run BLACKGLASS in an air-gapped environment?**
> A: Yes — set `BLACKGLASS_AIRGAPPED=true`. The console refuses to
> dispatch outbound calls and exposes `/api/health/airgap` for
> monitoring infrastructure to confirm the flag is active.

> **Q: Can the AI remediator break our hosts?**
> A: No — it doesn't run anything against production. See
> `blackglass-remediator/docs/safety-model.md`.

> **Q: Do you support OCSF / SIEM integration?**
> A: Yes — OCSF 2.0 (Compliance Finding) and 9 other formats: Slack,
> PagerDuty, ServiceNow, Jira, Datadog, Linear, GitHub, Splunk HEC,
> AWS Security Hub (ASFF), Microsoft Sentinel (CEF). See
> `src/lib/server/outbound-webhook.ts`.

> **Q: What's your DR plan?**
> A: See [`docs/runbooks/operations.md`](./runbooks/operations.md).

> **Q: How do you prevent silent schema drift between code and database?**
> A: Hash-tracked migrations (`drizzle.__drizzle_migrations`) plus a PR-time
> static check (`db:migrate:files`) plus a CI-time end-to-end apply against
> a fresh Postgres. See § 8a above.

---

## 10b. Security questionnaire mapping (drop-in answers)

The table below maps the most-common SaaS security questionnaire
headings to the mechanism BLACKGLASS uses, and to the file or doc a
reviewer can read to verify the claim. Copy a row directly into your
DPA / SOC-2 evidence bundle.

| Questionnaire heading                | Mechanism                                                                        | Source of truth                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Identity provider / SSO              | SAML SSO via Clerk Enterprise                                                    | `src/app/api/v1/settings/sso/route.ts`, [§1](#1-auth--iam)                                                                   |
| User provisioning                    | SCIM 2.0 via Clerk Enterprise                                                    | `src/app/api/v1/settings/scim/route.ts`                                                                                      |
| Multi-factor authentication          | Enforced via Clerk; per-org policy                                               | Clerk dashboard; [§1](#1-auth--iam)                                                                                          |
| Role-based access control            | `SaasPermission`-keyed RBAC (`drift.read`, `drift.manage`, `audit.read`, …)      | `src/lib/saas/rbac.ts`                                                                                                       |
| API authentication                   | API keys with prefix fingerprinting + bcrypt-hashed secret + rotation            | `src/lib/saas/api-key.ts`                                                                                                    |
| Tenant isolation                     | `tenant_id` on every table + Postgres RLS + `withTenantRls` enforced in CI       | `tests/unit/rls-tenant-leak.test.ts` (CI-gated against fresh Postgres)                                                       |
| Encryption at rest — DB              | DigitalOcean managed Postgres (provider-side AES-256)                            | DO managed-DB security overview                                                                                              |
| Encryption at rest — object storage  | DigitalOcean Spaces (provider-side AES-256)                                      | DO Spaces security overview                                                                                                  |
| Encryption at rest — secrets         | Envelope encryption (AES-256-GCM) for SSH creds; BYOK per-tenant KEK supported   | `src/lib/server/secrets/envelope.ts`, `src/lib/server/secrets/tenant-kms.ts`, [§3](#3-data-protection-in-transit--at-rest)   |
| Encryption in transit                | TLS 1.2+ (1.3 preferred) on all endpoints; HSTS via security-headers middleware | `src/lib/server/http/security-headers.ts`                                                                                    |
| Webhook authenticity                 | HMAC-SHA256 (`X-Blackglass-Signature: sha256=…`) with per-tenant signing keys + key-rotation header | `src/lib/server/outbound-webhook.ts`                                                                                         |
| Inbound rate limiting                | Per-IP rate-limit on every public endpoint; per-tenant cap on POST `/api/v1/scans` | `src/lib/server/rate-limit.ts`                                                                                               |
| Audit logging                        | `saas_audit_events` (tenant-scoped) for SSO, SCIM, API keys, scans, remediations, exports | `src/lib/saas/event-log.ts`, [§4](#4-logging--audit)                                                                         |
| AI / agent governance                | 4-tier risk-policy gate + forbidden-command denylist + per-category confidence cap + sudo/SSH auto-escalation + HMAC Approval Token | `blackglass-remediator/docs/safety-model.md`, [§8](#8-ai--remediator-governance)                                             |
| Vulnerability scanning (deps)        | Dependabot daily on Node + Python                                                | `.github/dependabot.yml`                                                                                                     |
| Static application security testing | Semgrep `p/owasp-top-ten` + JS/TS + secrets, fails CI on ERROR                   | `.github/workflows/semgrep.yml`                                                                                              |
| Dynamic application security testing | OWASP ZAP baseline against staging on every push to main                         | `.github/workflows/dast-zap-baseline.yml`                                                                                    |
| Secret management                    | Doppler / DO env vars; nothing committed; air-gap mode disables outbound calls   | `.env.example`, `src/lib/server/airgap.ts`                                                                                   |
| Backup & restore                     | Daily Postgres snapshot + weekly `pg_dump` to Spaces; documented restore-into-staging | `docs/runbooks/operations.md` § 3                                                                                            |
| Disaster recovery / RTO              | Documented quarterly drill, target RTO ≤ 4 h, RPO ≤ 24 h                         | `docs/runbooks/operations.md` § 4                                                                                            |
| Air-gapped operation                 | `BLACKGLASS_AIRGAPPED=true`; `/api/health/airgap?probe=true` self-test; Sentry & PostHog disabled in browser via `NEXT_PUBLIC_BLACKGLASS_AIRGAPPED` | `src/lib/server/airgap.ts`, `src/instrumentation-client.ts`                                                                  |
| Security headers                     | CSP (Report-Only by default), X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP applied via middleware | `src/lib/server/http/security-headers.ts`                                                                                    |
| Sub-processor list                   | Clerk, Stripe, Resend, DigitalOcean, Sentry (optional), PostHog (optional)       | [`docs/vendor-inventory.md`](./vendor-inventory.md)                                                                          |
| Customer data export                 | Per-tenant data-export bundles (Spaces upload or inline JSON), audit-logged       | `src/lib/server/services/export-service.ts`, `src/app/api/v1/exports/route.ts`                                               |
| Right to deletion                    | Tenant deletion via admin; cascades through `tenant_id` FKs and partition prune | `src/lib/saas/tenant-service.ts`                                                                                             |
| Schema migration governance         | Hash-tracked Drizzle migrations + CI fresh-apply + `db:migrate:check` PR gate    | [§8a](#8a-schema-integrity--migration-governance)                                                                            |

---

## 11. Things that are intentionally NOT done (and why)

Transparency reduces back-and-forth in security review:

- **Customer-managed encryption keys (CMEK / BYOK) — Enterprise tier.**
  Per-tenant KEK is supported (AWS KMS or HashiCorp Vault) and routed
  through `EncryptedKey.tenantId` so legacy global-KEK blobs continue
  to round-trip safely. UI lives at Settings → Identity → Bring your
  own key; backend in `src/lib/server/secrets/tenant-kms.ts`. The
  global KMS (env-managed `local`, Vault, or AWS KMS) remains the
  default for tenants that haven't opted in.
- **WORM audit retention is opt-in.** `saas_audit_events` lives in
  Postgres and exports as deterministic JSONL (`npm run audit:verify-jsonl`)
  with an integrity digest, suitable for cold storage in S3 + Object
  Lock. We do not run an Object-Lock bucket on the customer's behalf.
  DigitalOcean Spaces does not currently support S3 Object Lock —
  customers requiring WORM evidence should mirror exports to an
  AWS S3 bucket configured with Object Lock in Governance mode.
- **DAST is scheduled, not gating.** A ZAP baseline workflow runs against
  staging on demand and on a weekly cron when `STAGING_URL` is set
  (`.github/workflows/dast-zap-baseline.yml`); failures don't block PRs
  by default. Tune via `docs/zap-baseline-rules.md`.
- **No SOC 2 attestation yet.** The control surface is in place;
  formal audit is in planning. Don't claim SOC 2 on the website until
  the report exists.
