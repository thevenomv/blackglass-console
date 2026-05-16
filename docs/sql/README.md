# Hand-applied SQL (out-of-band)

Files in this directory are **not** part of the Drizzle migration chain in
`drizzle/`. The canonical SaaS schema is owned by Drizzle and applied via:

```bash
npm run db:migrate
```

Everything in `docs/sql/` is one of two things:

| File | Purpose |
|---|---|
| `audit-events.sql` | Legacy single-tenant `blackglass_audit` table used when running the open-source / standalone build with `AUDIT_DATABASE_URL`. Consumed by `src/lib/server/store/legacy/audit-append-pg.ts`. |
| `baselines-and-drift-history.sql` | Legacy single-tenant `blackglass_baselines` and `blackglass_drift_history` tables. Consumed by `src/lib/server/store/legacy/baseline-pg.ts` and `src/lib/server/store/legacy/drifthistory-pg.ts`. |
| `subscription-status-past-due.sql` | Out-of-band Postgres enum patch (`ALTER TYPE ... ADD VALUE`) that cannot run inside a transaction and therefore cannot live in the Drizzle chain. Applied by `scripts/run-migration-008.mjs`. |

## Why are these not numbered like Drizzle?

The previous `001_*`, `002_*`, `008_*` prefixes implied an ordering relationship
with the Drizzle migrations in `drizzle/0000_*` through `drizzle/0026_*`. There
is none. The numbering was historical and misleading — it has been removed.

## When do I add a file here?

Only when a schema change **cannot** be expressed inside a Drizzle migration:

- `ALTER TYPE ... ADD VALUE` and other statements that must run outside a transaction.
- DDL for tables that are intentionally outside the SaaS schema (legacy single-tenant).
- One-off backfills that are applied manually with operator oversight.

For everything else, run `npm run db:generate` and let Drizzle own it.
