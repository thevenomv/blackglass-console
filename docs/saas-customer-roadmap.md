# BLACKGLASS — SaaS customer roadmap

This is a **product and engineering** path from a single-tenant ops console to **SaaS**. Technical items assume DigitalOcean App Platform or equivalent; adjust for your host.

---

## Stage 0 — Internal / design partner (today)

**Goal:** One team, known hosts, manual onboarding.

- Deploy with **`AUTH_REQUIRED=true`**, **`AUTH_SESSION_SECRET`** (strong random; platform secret type on DO), encrypted collector secrets (Doppler sync or env), **`NEXT_PUBLIC_USE_MOCK=false`**.
- Mount volumes for **`BASELINE_STORE_PATH`** / **`DRIFT_HISTORY_PATH`** if you care about restart survival.
- Run **`npm run verify:stage0`** locally (same gates as CI minus Playwright) before merge; rely on GitHub Actions on **`main`**; after each deploy to a real host, **`STAGING_URL=… npm run verify:staging`** (or your production origin).
- **Exit:** Stable baseline → scan → drift loop on real SSH; operators trust health + Settings runtime panel.

---

## Stage 1 — Staging as a product dress rehearsal

**Goal:** Same build path as prod, dedicated URL, no customer data yet.

- **Environment:** Staging app + staging Doppler config (or isolated Infisical/Vault project).
- **Checklist:** Follow **`docs/staging-deployment-checklist.md`**.
- **Automation:** In GitHub: Actions → **Staging smoke** (`workflow_dispatch`) after adding repo secret **`STAGING_URL`**. Or locally: **`npm run verify:staging`**.
- **Data:** No production baselines; use disposable VMs for SSH targets.
- **Exit:** Repeatable deploy; staging green on script + optional **`PLAYWRIGHT_LIVE=1`** against staging.

---

## Stage 2 — Private beta (first paying or pilot tenants)

**Goal:** Multiple **logical** customers without full multi-tenant isolation yet — **still one deployment** or a **few** dedicated instances (BYOC-lite).

- **Identity:** Enforce console auth; document session signing and rotation (`AUTH_REQUIRED`, cookie secrets).
- **Isolation:** Prefer **separate Doppler projects or configs per tenant** and **separate App Platform apps** over sharing one `COLLECTOR_HOST_*` set — until you have true tenant ID in DB.
- **Onboarding:** Written runbook (SSH user on target, key exchange, first baseline); consider in-app checklist.
- **Support:** Channel (email/Slack); define **severity** and response expectations (not SLA yet).
- **Billing:** Manual invoices or Stripe **internal** — no need for embedded billing UI on day one.
- **Exit:** N tenants live; incidents are rare and diagnosable via **`collector.*` logs + audit tail**.

---

## Stage 3 — Multi-tenant SaaS (single app, many orgs)

**Goal:** One codebase serves many customers with **strong** data and secret boundaries.

- **Data plane:** Move baselines, drift events, audit, and scan metadata off ephemeral disk into **PostgreSQL** (or equivalent). Files on volume remain an option for **export** only.
- **Control plane:** **Tenant ID** on every row; API and UI scoped by tenant; no cross-tenant `host_id` leakage.
- **Secrets:** Per-tenant credentials — **prefer OIDC / workload identity** to secret managers over long-lived PEMs in your DB.
- **Workers:** Long scans and SSH fan-out in a **queue + worker** (BullMQ, Inngest, etc.) so the Next.js web tier stays responsive under load.
- **Compliance:** SOC2-style controls — audit **export** to immutable store, retention policy, RPO/RTO documented.

---

## Stage 4 — Enterprise / regulated buyers

**Goal:** Meet procurement and security questionnaires.

- **SSO:** SAML/OIDC (e.g. WorkOS, Auth0 Enterprise).
- **Audit:** Tamper-evident or SIEM streaming; **signed** audit export optional.
- **Uptime:** Published status page; SLOs for API availability (not SSH success rate — that’s customer network).
- **DPA / GDPR:** If EU customers — subprocessors list, data residency options.

---

## Recommended sequencing (engineering)

1. Staging checklist + **`verify-staging.mjs`** in CI (manual trigger is fine).
2. Persistent **volumes** or first **DB** migration for baselines + audit.
3. **Per-tenant** deployment or tenant row + scoping (choose one model before wide SaaS).
4. **Queue + worker** for collection when parallel SSH or duration threatens web tier SLIs.
5. **Billing + SSO** when pipeline, not before Stage 2 stability.

For the current repo’s automated tests: they are **regression guards**, not proof of SaaS safety — combine with staging verification and pilot contracts.
