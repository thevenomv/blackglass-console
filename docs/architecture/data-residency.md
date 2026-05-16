# Data residency (operator notes)

BLACKGLASS itself is region-agnostic: you choose regions for **managed Postgres**, **Redis/Valkey**, **object storage**, **Clerk** (instance / EU option where offered), and **Stripe** (account country + tax settings).

For EU-only processing commitments:

1. Provision **PostgreSQL** and app compute in an EU region (e.g. DigitalOcean `fra1` / `ams3`).
2. Configure **Clerk** for the appropriate data region per Clerk’s deployment options.
3. Use a **Stripe** account aligned with your contracting entity; Checkout and invoices follow Stripe’s data handling for that account.
4. Prefer EU **Spaces** or S3 buckets in-region for optional audit/baseline artefacts.
5. Document the **subprocessor list** (DO, Stripe, Clerk, Sentry, etc.) in customer DPAs — this file is not legal advice.
