# ADR 0001 — Repository layering conventions

- **Status:** Accepted
- **Date:** 2026-05-16
- **Supersedes:** n/a
- **Related:**
  - `.cursor/rules/saas-authz-boundaries.mdc`
  - `eslint.config.mjs` (the `no-restricted-imports` block)
  - `CODEOWNERS`

## Context

Blackglass started as a single-tenant CLI/agent product and grew into a
multi-tenant SaaS on Next.js 16. Over ~18 months several patterns settled
in but were never written down, so new code (and migrations away from the
single-tenant model) kept blurring the lines:

1. **client vs server modules** were not visually separated — both lived
   directly under `src/lib/` and the import boundary was guessed from the
   file name.
2. **legacy single-tenant authz** (a JSON role table read out of a cookie)
   coexists with **SaaS authz** (Clerk + tenant memberships + RBAC + RLS).
   New API routes routinely reached for the legacy module by accident.
3. **legacy Postgres adapters** (open-source, single-tenant tables outside
   the Drizzle schema) were intermixed with the SaaS repositories.
4. The **canonical schema** was one 742-line `src/db/schema.ts` and engine
   files were trending past 40 KB.
5. `scripts/`, `tests/unit/` and `docs/` were flat directories that grew
   uncomfortable to navigate at 50–80 files.

## Decision

We adopt the following layering rules. They are enforced by a mix of
folder convention, ESLint `no-restricted-imports`, and CODEOWNERS review.

### 1. `src/lib/` is split by execution surface

| Folder | Allowed to import | Notes |
|---|---|---|
| `src/lib/client/` | other `client/` modules, primitives | Safe to bundle into client components. No `fs`, no `pg`, no env reads. |
| `src/lib/server/` | anything | Server-only. May import from `client/` (but not vice-versa). |
| `src/lib/<domain>/` (e.g. `auth/`, `saas/`, `billing/`) | both, but the file should be isomorphic | If a module turns out to be server-only, move it under `src/lib/server/<domain>/`. |

### 2. SaaS authz is the only authz used by `src/app/api/**`

- All route handlers use `@/lib/server/http/saas-access`:
  `requireTenantAuth` / `requireTenantPermission` /
  `requireSaasOrLegacyPermission`.
- Direct imports of `@/lib/auth/legacy-permissions` from
  `src/app/api/**` are an **ESLint error**. The one allowed exception is
  `/api/session`, which is the legacy cookie endpoint itself.
- See `.cursor/rules/saas-authz-boundaries.mdc` for the full ruleset.

### 3. Legacy Postgres adapters live in one folder

`src/lib/server/store/legacy/` holds the four `pg`-based adapters that
talk to single-tenant tables outside the Drizzle schema (`audit-append`,
`baseline`, `drift-history`, `drift-events`). Anything else that talks to
the database goes through Drizzle and lives in `src/db/schema/` plus a
service module under `src/lib/server/services/`.

See `src/lib/server/store/legacy/README.md` for which tables map to which
adapter and which `docs/sql/*.sql` file ships their DDL.

### 4. `src/db/schema/` is a folder, not a file

The canonical schema is split by domain (`saas`, `credentials`, `hosts`,
`sandboxes`, `evidence`, `drift`, `notifications`, `kms`, `retention`,
`scan-usage`, `janitor`). `src/db/schema/index.ts` re-exports everything
so existing `import … from "@/db/schema"` call sites are unchanged.

`drizzle.config.ts` points at `src/db/schema/index.ts`. New tables get a
new file in that folder if their domain isn't already represented.

### 5. Large engine files become folder modules with a REFACTOR plan

Any file in `src/lib/server/` over ~30 KB / ~1 000 LOC should be a folder
module (`<name>/index.ts`) with a `REFACTOR.md` describing the planned
carve-up. This is a holding pattern: the goal is to reduce monoliths,
but converting to a folder up-front prevents accidental new dependencies
on internals and gives reviewers a place to anchor follow-up PRs.

Current holding-pattern modules:

- `src/lib/server/drift-engine/`
- `src/lib/server/outbound-webhook/`

### 6. `scripts/`, `tests/unit/`, `docs/` are domain-grouped

- `scripts/<domain>/<script>.ts|.mjs` — `npm run` aliases keep their old
  short names, so the CLI surface is unchanged.
- `tests/unit/<domain>/<area>.test.ts` — Vitest's recursive glob picks
  these up automatically.
- `docs/<domain>/<doc>.md` — `docs/README.md` is the navigation index.

### 7. Verify pipeline is split for fast feedback

- `verify:fast` — lint + typecheck + unit. Run on every save / pre-push.
- `verify:contract` — RLS-bypass scan + OpenAPI lint + schemas export
  diff + migration check. Run before opening a PR that touches API or
  schema surface.
- `verify:build` — `next build`. Run before merge.
- `verify:stage0` — the union (the legacy single-target CI runs this).

## Consequences

**Positive**

- New contributors can place a file by reading its first import.
- Authz misuses are caught by ESLint, not code review.
- Schema and engine refactors become incremental — each move is small
  enough to review in isolation.
- The verify pipeline gives sub-30-second feedback on most edits
  instead of the previous 4-minute monolithic run.

**Negative**

- More directory nesting (every test now lives one level deeper than
  before). Relative imports got longer — the planned migration to the
  `@/` alias for test imports (`#7` in the punch-list) removes most of
  this pain.
- Two parallel authz models (legacy and SaaS) keep coexisting until the
  legacy cookie path is removed entirely. The boundary above is the
  guard rail until then.
- Holding-pattern folder modules (`drift-engine/`, `outbound-webhook/`)
  are a half-step; the eventual goal is per-domain files within them.

## Notes

- This ADR was added retroactively to capture the rules that the
  2026-05-16 layout refactor enforced. Future structural changes should
  add a new ADR rather than rewriting this one.
