# Legacy single-tenant Postgres adapters

These four modules talk to **legacy single-tenant** Postgres tables that exist
**outside** the canonical Drizzle / SaaS schema:

| Adapter | Table | DDL |
|---|---|---|
| `audit-append-pg.ts` | `blackglass_audit` | [`docs/sql/audit-events.sql`](../../../../../docs/sql/audit-events.sql) |
| `baseline-pg.ts` | `blackglass_baselines` | [`docs/sql/baselines-and-drift-history.sql`](../../../../../docs/sql/baselines-and-drift-history.sql) |
| `drifthistory-pg.ts` | `blackglass_drift_history` | same as above |
| `driftevents-pg.ts` | `blackglass_drift_events` (with tenant_id) | [`drizzle/0017_drift_events_pg.sql`](../../../../../drizzle/0017_drift_events_pg.sql) |

## When are these used?

1. **Open-source / standalone deployments** that don't run the full SaaS
   schema. Those installs apply only the SQL files in `docs/sql/` and these
   adapters write to the resulting plain tables.
2. **SaaS deployments** still use `driftevents-pg.ts` — the table is
   multi-tenant via `tenant_id` plus RLS — but the other three are bypassed
   in favour of the SaaS schema in `src/db/schema/`.

## Why are they `pg` instead of Drizzle?

Drizzle expects to own the full schema. These tables predate Drizzle in the
codebase and a couple have non-Drizzle features (`JSONB` arrays of mixed
types, manual indexes). Rewriting them as Drizzle tables would force them
into the Drizzle migration chain, which is exactly what we don't want for
**out-of-band** schema.

## When should I add code here?

Only if the new code talks to one of the legacy tables. Anything that lives
in the canonical SaaS schema belongs in `src/lib/server/store/` (or its
parent service module) and should use Drizzle.
