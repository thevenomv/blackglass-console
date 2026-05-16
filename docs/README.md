# Internal documentation (operators & engineers)

Markdown in this directory is **not** part of the customer-facing product. It is meant for **operators**, **security reviewers**, and **engineers** with repo or private runbook access.

- Do **not** link these files from marketing pages, the in-app console for end users, or public footers.
- Customer-facing education lives under `src/app/guides/`, `src/app/use-cases/`, `/security`, `/privacy`, and similar routes, and should avoid exposing repository paths or internal runbook filenames.
- **Stakeholder review packet:** Cursor Canvas **Project overview** — `project-overview.canvas.tsx` in the workspace `canvases/` directory (IDE-managed; open from the Canvas panel).

## Index

### [`architecture/`](architecture/)

System shape, request flow, **deployment topology** ([`deployment.md`](architecture/deployment.md)), data residency, design tokens, theming, i18n, vendor inventory, ADRs ([`adr/`](architecture/adr/)) and audit trail.

### [`security/`](security/)

Compliance posture, pentest checklist, session/cookie security, ZAP rules, rate-limit ADRs, retention policy, incident response, access reviews, passphrase recovery.

### [`operations/`](operations/)

Day-2 runbooks for operators: local dev (Docker), backup/restore drill, release checklist, baseline runbook, troubleshooting, collector fleet scaling, Doppler + DigitalOcean setup, GitHub Actions first run, staging deployment checklist, operator guide, Charon/janitor, wiring & exports.

### [`runbooks/`](runbooks/)

Targeted runbooks (alphabetical): customer-first-week, data-breach-response, deploy-scan-worker, email-deliverability, operations.

### [`saas/`](saas/)

SaaS-only concerns: customer roadmap, Clerk RBAC, Clerk ops checklist, legacy auth matrix, Stripe cutover & soak, webhook processing.

### [`compliance/`](compliance/)

Review cadence and audit-related artefacts.

### [`integrations/`](integrations/)

External system integration notes (webhook CEF format, etc.).

### [`sales/`](sales/)

Internal sales playbooks (Apollo cold email sequences) — paste-ready, sent via Apollo mailboxes (not Resend product mail).

### [`marketing/`](marketing/)

SEO and sales-demo walkthrough notes that inform the marketing site but live with engineering for cross-reference.

### [`sql/`](sql/)

Hand-applied SQL outside the Drizzle migration chain — legacy single-tenant DDLs and out-of-band patches. See [`sql/README.md`](sql/README.md).
