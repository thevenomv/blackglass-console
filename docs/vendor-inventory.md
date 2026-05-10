# BLACKGLASS — Vendor / sub-processor inventory

> Version: 1.1 · Last reviewed: 2026-05-10
> Audience: customer security reviewers, DPA / sub-processor questionnaires.

This is the canonical list of third-party services that may receive
customer data when the BLACKGLASS console is operated by Obsidian
Dynamics on the public SaaS plan. Self-hosted customers control their
own vendor list; this file applies to the SaaS deployment.

For each vendor we list:
- **Purpose** — why we use them.
- **Data categories** — what kind of data they receive.
- **Required vs optional** — whether the integration can be disabled
  without losing core functionality.
- **DPA / contact** — how to reach their data protection function.

Anything marked **Optional** is gated behind an env var or per-tenant
configuration; in `BLACKGLASS_AIRGAPPED=true` mode all optional
outbound integrations are short-circuited at dispatch time (see
`src/lib/server/airgap.ts`).

---

## Charon — tenant cloud APIs (not Obsidian sub-processors)

When Charon is enabled, BLACKGLASS workers call **DigitalOcean, AWS, or
Google Cloud APIs** using **credentials uploaded by the tenant**. Those
calls are made from BLACKGLASS infrastructure (typically DigitalOcean
App Platform) but are **authorised by the customer** against **the
customer’s** cloud accounts. For sub-processor questionnaires: this is
analogous to SSH reachability to customer-owned servers — the listed
cloud vendor is not a new Obsidian Dynamics sub-processor solely because
Charon exists; metadata returned is stored in tenant-scoped Postgres
under RLS like drift data. Customer-configured HTTPS webhooks may receive
`charon.scan.completed` events alongside drift payloads.

---

## Required (core platform)

| Vendor             | Purpose                                                | Data categories                                                                | DPA / contact                                       |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| **DigitalOcean**   | Compute (App Platform), Postgres (Managed DB), Spaces (object storage), Droplets (sandbox VMs) | Drift events, baselines, evidence bundles, audit log, host metadata, encrypted SSH credentials | https://www.digitalocean.com/legal/data-processing-agreement |

DigitalOcean is the only **mandatory** sub-processor. Every other
vendor on this list can be disabled without taking the product offline.

---

## Optional (operator can disable)

| Vendor             | Purpose                                                | Data categories                                                | Default state         | Disable mechanism                                            | DPA / contact                                                                 |
| ------------------ | ------------------------------------------------------ | -------------------------------------------------------------- | --------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **Clerk**          | Authentication, SSO, SCIM, MFA                         | User name, email, org id, session metadata                     | On (SaaS)             | Drop `CLERK_*` env vars; falls back to legacy session auth    | https://clerk.com/legal/dpa                                                   |
| **Stripe**         | Billing & subscription management                      | Org id, billing email, subscription state, payment metadata    | On (SaaS, paid plans) | Drop `STRIPE_*` env vars; free plan needs no billing         | https://stripe.com/legal/dpa                                                  |
| **Sentry**         | Error tracking & performance monitoring                | Error stack traces, request metadata (PII stripped)            | On (SaaS)             | Drop `SENTRY_DSN`                                            | https://sentry.io/legal/dpa/                                                  |
| **Resend**         | Transactional email (alerts, invites)                  | Recipient email, alert payload                                 | On (SaaS)             | Drop `RESEND_API_KEY`; or set `BLACKGLASS_AIRGAPPED=true`    | https://resend.com/legal/dpa                                                  |
| **PagerDuty**      | Operator alerting (Sentry → PagerDuty bridge)          | Error fingerprint, severity, BLACKGLASS link                   | Off by default        | Drop `PAGERDUTY_INTEGRATION_KEY`                              | https://www.pagerduty.com/legal/data-processing-agreement/                    |
| **Doppler**        | Secret management for the SaaS deployment              | All BLACKGLASS env secrets                                     | On (SaaS)             | Replace with another secret manager (AWS Secrets Manager, Vault, etc.) | https://www.doppler.com/dpa |

---

## Optional (per-tenant configuration)

These are outbound webhook / SIEM destinations that customers configure
for themselves in Settings → Notifications. Data flows only after the
customer explicitly opts in.

| Vendor type                    | What it receives                                     | Format                |
| ------------------------------ | ---------------------------------------------------- | --------------------- |
| Slack                          | Drift summaries (block-kit)                          | Slack webhook JSON    |
| PagerDuty                      | Drift incident events (Events API v2)                | PagerDuty Events v2   |
| ServiceNow                     | Drift incidents (Incident table)                     | ServiceNow JSON       |
| Jira                           | Drift issues                                         | Jira REST v3 JSON     |
| Datadog                        | Drift events (Events API)                            | Datadog Events JSON   |
| Linear                         | Drift issues (GraphQL)                               | Linear GraphQL JSON   |
| GitHub                         | Drift issues (Issues API)                            | GitHub REST JSON      |
| Splunk HEC                     | Drift events as Splunk events                        | Splunk HEC JSON       |
| AWS Security Hub               | Drift findings (ASFF)                                | ASFF JSON             |
| Microsoft Sentinel             | Drift events (CEF)                                   | CEF over HTTPS        |
| OCSF (Security Lake / Splunk OCSF / Snowflake / OpenSearch) | Drift events as OCSF Compliance Findings (class 2003) | OCSF 2.0 JSON         |
| Generic webhook (HMAC-signed)  | Drift events; optional Charon `charon.scan.completed` | BLACKGLASS native JSON |

The router that decides which payload format applies lives at
`src/lib/server/outbound-webhook.ts::detectPlatform()`.

---

## Optional (self-hosted customers only)

Self-hosted customers may bring their own KMS provider for envelope
encryption of SSH credentials:

| Vendor                  | Purpose                                          | Configuration                                                  |
| ----------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| Local key (default)     | KEK held in `KMS_LOCAL_KEY`; suitable for single-node, dev, or air-gapped pilots | `KMS_PROVIDER=local`, `KMS_LOCAL_KEY=<base64-32B>`             |
| HashiCorp Vault Transit | KEK via Vault Transit                            | `KMS_PROVIDER=vault`, `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_TRANSIT_KEY` |
| AWS KMS                 | KEK via AWS KMS                                  | `KMS_PROVIDER=awskms`, `AWS_REGION`, `KMS_KEY_ID`, AWS credentials in env |
| OpenTelemetry collector | Trace export (any OTLP-compatible backend)       | `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`    |

---

## Data categories — what each vendor sees

For the privacy team filling in a sub-processor questionnaire:

| Vendor       | Customer drift events | Customer baselines | Encrypted SSH creds | User PII (name/email) | Billing data | Error stack traces |
| ------------ | :-------------------: | :----------------: | :-----------------: | :-------------------: | :----------: | :----------------: |
| DigitalOcean |          ✓            |         ✓          |          ✓          |           ✓           |              |                    |
| Clerk        |                       |                    |                     |           ✓           |              |                    |
| Stripe       |                       |                    |                     |     org-id only       |      ✓       |                    |
| Sentry       |                       |                    |                     |   minimal (PII stripped) |              |        ✓           |
| Resend       |                       |                    |                     |     recipient only    |              |                    |
| PagerDuty    |     fingerprint only  |                    |                     |                       |              |     fingerprint    |
| Doppler      |                       |                    |          ✓ (env)    |                       |              |                    |

"Encrypted SSH creds" means the wrapped DEK + ciphertext blob — none of
these vendors holds the unwrapping key for production traffic
(DigitalOcean stores the ciphertext but not the KMS KEK).

---

## Change log

- **2026-05-10** v1.1 — Charon cloud-API clarification + webhook row note.
- **2026-05-07** v1.0 — Initial inventory written for Wave 10 review packet.

If a vendor is added, removed, or changes purpose, file a PR updating
this document **before** the integration ships to production. Customer
trust depends on this list being accurate and current.
