# Postgres row-level security (RLS)

## Shipped control

Multi-tenant tables use **RLS** plus per-transaction GUCs:

- `app.tenant_id` — UUID string (`saas_tenants.id`) for authenticated workspace requests.
- `app.bypass_rls` — `'1'` only on **trusted server paths** (Clerk/Stripe webhooks, provisioning).

**Migration:** apply `docs/migrations/007_saas_rls.sql` after `004`–`006`.

**Drizzle:** `npx drizzle-kit generate` emits `drizzle/0000_*.sql` from `src/db/schema.ts` for greenfield databases. If tables already exist from `docs/migrations/004`–`006`, skip that file and apply `007_saas_rls.sql` only.

**Application wrappers:** `withTenantRls` and `withBypassRls` in `src/db/index.ts` open a transaction, call `set_config(..., true)` (transaction-local), then run Drizzle queries.

`saas_webhook_idempotency` intentionally has **no RLS** (no `tenant_id`).

## Operational scripts

Jobs that **DELETE across tenants** (e.g. `scripts/prune-saas-audit-events.mjs`) must set `app.bypass_rls` for the session or use a `BYPASSRLS` database role.

## Migrations vs app role

Use a migration/admin role with sufficient privileges for `007_saas_rls.sql`. The runtime app role should **not** be a superuser; `FORCE ROW LEVEL SECURITY` applies to table owners too, so policies must allow the intended paths (tenant-scoped or bypass).

## GUC heterogeneity (read this before adding a new policy)

The application code (`withTenantRls()` in `src/db/index.ts`) sets the
**`app.tenant_id`** GUC on every authenticated request. New policies on
new tables must read from the same GUC.

Some legacy migrations (e.g. `drizzle/0003_*`, `drizzle/0008_*`) define
policies against `app.current_tenant` / `app.current_tenant_id`. These
are **historical** and need a follow-up audit to converge on
`app.tenant_id`. Until that audit lands, do not assume one canonical GUC
across all tables — check the table's `CREATE POLICY` statement.

## Legacy note

Earlier revisions treated this as a sketch; RLS is now part of the
supported defence-in-depth model alongside `requireTenantAuth()` and
Postgres membership rows.
