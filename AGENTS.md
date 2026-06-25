# AGENTS.md

Guidance for AI agents working in this repository.

## Cursor Cloud specific instructions

### Product scope

Blackglass is a Next.js 16 fleet integrity console (baselines, SSH scans, drift detection). Optional sibling: `blackglass-remediator/` (Python FastAPI). Default local dev does **not** require Postgres/Redis when using mock mode.

### Quick dev (stage-0 / mock)

Standard commands are in [README.md](README.md). Typical cloud-agent loop:

1. `npm ci` (Node **22.x**, npm **10+** — see [.nvmrc](.nvmrc))
2. `cp .env.example .env.local` and set `NEXT_PUBLIC_USE_MOCK=true` for seeded hosts/drift without SSH or Postgres
3. `npm run dev` → http://127.0.0.1:3000

Health: `GET /api/health`. Core API smoke: `GET /api/v1/hosts`, `POST /api/v1/scans` (in-process when `REDIS_QUEUE_URL` is unset), `GET /api/v1/drift`.

### Quality gates

| Command | Purpose |
|---------|---------|
| `npm run verify:fast` | lint + typecheck + unit tests |
| `npm run verify:build` | production `next build` |
| `npm run verify:stage0` | full CI gate (adds contract checks + build) |

**Note:** `verify:stage0` includes `check:rls-bypass` (tag/call parity) and OpenAPI/Zod contract checks. If `verify:stage0` fails on a clean `main` checkout, run `verify:fast` and `verify:build` separately to validate runtime; fix RLS/OpenAPI drift only when your change touches those areas.

ESLint reports warnings only (no `--max-warnings 0`).

### Playwright E2E

- Install browsers once per VM: `npx playwright install chromium`
- Default config starts its own dev server on port **3100**. If `npm run dev` is already bound to **3000**, either stop it or set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000` to reuse the running server (disables `webServer` in config).
- `npm run test:e2e` uses mock data unless `PLAYWRIGHT_LIVE=1`.

### Postgres + Redis (optional, production-like)

Docker is **not** required for mock dev. When available:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Merge env from [docs/operations/local-dev-docker.md](docs/operations/local-dev-docker.md), then `npm run db:migrate`. With `REDIS_QUEUE_URL` set, run workers in separate terminals: `npm run worker`, `npm run worker:ops`.

### Workers

| Process | Command | When needed |
|---------|---------|-------------|
| Web | `npm run dev` / `npm run start` | Always |
| scan-worker | `npm run worker` | `REDIS_QUEUE_URL` set |
| ops-worker | `npm run worker:ops` | `REDIS_QUEUE_URL` set (webhooks, exports, retention) |

Without Redis, scans run **in-process** on the web tier (fine for mock/stage-0).

### Remediator (optional)

See [blackglass-remediator/README.md](blackglass-remediator/README.md): Python 3.12 venv, `pip install -e ".[dev]"`, `uvicorn` on `:8080`, optional Ollama.

### Secrets / auth

- Do not commit `.env.local`. Clerk/Stripe keys in `.env.local` can break default E2E unless Playwright env flags are set (see `playwright.config.ts`).
- `AUTH_REQUIRED=false` by default; mock mode needs no Clerk.

### Operator CLI

`node scripts/cli/blackglassctl.mjs health --base=http://127.0.0.1:3000`
