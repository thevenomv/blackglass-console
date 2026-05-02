# Multi-tenant product outline (code + data)

BLACKGLASS today is largely **single-tenant / operator-deployed**. Plan tiers (`BLACKGLASS_PLAN`) gate features; they are not isolated org namespaces.

## Stages toward SaaS tenancy

| Stage | Behaviour |
|-------|-----------|
| **0 — current** | One deployment per operator; SSO later in roadmap docs. |
| **1 — logical tenant** | `tenant_id` on hosts, audits, Spaces keys — strip from all queries (`WHERE tenant_id = ?`). Session carries `tenant_id`. |
| **2 — Postgres RLS** | Row-level policies per tenant; pooled DB role per request. |
| **3 — enterprise** | Per-tenant KMS, dedicated egress IP, SSO per tenant (already roadmap Stage 4). |

Start with **JWT/session claim → middleware → server context carrier** (`AsyncLocalStorage` in Node) before touching SSH collectors — collectors must resolve **credential namespace** per tenant.
