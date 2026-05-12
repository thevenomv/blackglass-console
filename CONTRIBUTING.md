# Contributing

Thank you for helping improve Blackglass. This repository powers a production SaaS console, workers, and optional self-hosted Helm releases — changes should stay focused and easy to review.

## Before you open a pull request

1. **Scope** — One logical change per PR when possible (feature, fix, or doc cluster).
2. **Quality gate** — From the repo root:

   ```bash
   npm run verify:stage0
   ```

   On Windows with OneDrive quirks, if `.next` causes spurious failures:

   ```bash
   npm run verify:stage0:clean
   ```

3. **Migrations** — If you change `src/db/schema.ts`, generate Drizzle SQL and include it in `drizzle/` per existing conventions; never hand-edit applied migration history.
4. **RLS** — Tenant reads/writes go through `withTenantRls`. Any new `withBypassRls` usage must include a `// RLS-BYPASS:` tag and stay rare (webhooks, migrations, API key bootstrap only). CI enforces tag parity.
5. **OpenAPI** — If you add or change `/api/v1` routes, update `openapi/blackglass.yaml` so `npm run check:openapi` passes, then run `npm run schemas:export` and commit `openapi/zod-schemas.json` when the exporter changes it.

## Local development

- **Quick path:** [README.md](README.md) (`npm ci`, `.env.local`, `npm run dev`).
- **Docker Postgres + Redis:** [docs/local-dev-docker.md](docs/local-dev-docker.md) and [docker-compose.dev.yml](docker-compose.dev.yml).

## API examples

See [examples/api/README.md](examples/api/README.md) for minimal curl and Node samples against `/api/v1`.

## Security

Do **not** post security vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md).

## Style

Match surrounding code: imports, naming, error handling, and test patterns. Prefer extending existing helpers over parallel implementations.

## Commits and messages

Use clear, imperative subject lines and body text when context helps reviewers (what changed and why).
