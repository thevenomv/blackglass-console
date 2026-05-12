# Public roadmap

This is a **high-level, buyer-safe** summary. It is not a sprint plan or contractual commitment. Engineering detail and internal sequencing live in `docs/saas-customer-roadmap.md` (private to the repo).

## Shipped themes

- **Fleet integrity** — Linux baselines, drift detection, evidence exports, reports.
- **Multi-tenant SaaS** — PostgreSQL row-level security, Clerk Enterprise (SSO, SCIM, RBAC), Stripe billing.
- **Async platform** — BullMQ workers (scan, ops, optional sandbox), Redis-backed queues.
- **Integrations** — HMAC-signed outbound webhooks to common destinations; air-gapped mode for restricted environments.
- **Charon (optional)** — Cloud resource inventory and cleanup workflows with suppressions and auditability.
- **Remediator (optional sidecar)** — LLM-assisted proposals with tiered risk policy enforced in code and human approval gates.
- **Self-hosted** — Helm chart for Kubernetes alongside DigitalOcean App Platform templates.

## Near term (next quarters)

Themes under active investment (ordering may change):

- Deeper **per-tenant encryption controls** (BYOK / CMEK direction).
- **Helm + ops** polish for optional components (for example sandbox worker enablement paths and documentation).
- **Audit retention** options for long-lived compliance archives (customer-owned destinations and managed patterns).
- **Remediator quality** — scenario harnesses and stricter per-tenant policy knobs where customers need stricter tiers.
- **Network egress** predictability for integrations that IP-allowlist outbound traffic.

## Future (not dated)

Examples of backlog themes without committed delivery dates:

- Formal **SOC 2** attestation (controls are documented; do not claim completion until a report exists).
- **Multi-party approval** for high-risk remediation paths.
- Richer **Slack-first** approval UX for remediation workflows.

## How to respond in sales or procurement

- Point security reviewers at the in-repo **security packet** referenced from the root `README.md` (`docs/security-compliance.md`, architecture overview, runbooks).
- For “when will X ship,” prefer a direct commercial thread; this file is intentionally conservative.
