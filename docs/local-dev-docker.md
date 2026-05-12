# Local Postgres and Redis (Docker)

Use this when you want a **self-contained data plane** on the workstation without provisioning managed databases first.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)
- Node **22** and npm **10** (see root [README.md](../README.md))

## Start services

From the repository root:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Wait until `docker compose -f docker-compose.dev.yml ps` shows `healthy` for Postgres (first boot can take ~30s).

## Environment

Add or merge into `.env.local` (values match [docker-compose.dev.yml](../docker-compose.dev.yml)):

```bash
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000

DATABASE_URL=postgresql://blackglass:blackglass@127.0.0.1:5432/blackglass

# Optional: BullMQ workers + consistent API rate limits across processes
REDIS_QUEUE_URL=redis://127.0.0.1:6379
RATE_LIMIT_REDIS_URL=redis://127.0.0.1:6379
```

Then apply schema:

```bash
npm run db:migrate
```

## Port conflicts

If something else already binds **5432** or **6379**, edit the left-hand side of the `ports:` mapping in `docker-compose.dev.yml` (for example `5433:5432`) and point `DATABASE_URL` / Redis URLs at the published host port.

## Stop and reset

Stop containers:

```bash
docker compose -f docker-compose.dev.yml down
```

Wipe the Postgres volume (destructive):

```bash
docker compose -f docker-compose.dev.yml down -v
```

## What this does not replace

- **Clerk / Stripe / Doppler** — still configured per [.env.example](../.env.example) when you exercise those paths.
- **SSH collectors** — optional lab hosts and keys are unchanged.
- **Production** — use managed Postgres/Redis (DigitalOcean, Helm, or your cloud); see [operator-guide.md](operator-guide.md) and [deploy/helm/blackglass/README.md](../deploy/helm/blackglass/README.md).
