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

## Legacy note

Earlier revisions treated this as a sketch; RLS is now part of the supported defense-in-depth model alongside `requireTenantAuth()` and Postgres membership rows.
