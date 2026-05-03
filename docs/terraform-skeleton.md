# Terraform / IaC sketch

This repo does not ship a full Terraform root module. A typical **DigitalOcean** production stack:

- `digitalocean_app` — Web service (Next.js) + optional worker (BullMQ consumer)
- `digitalocean_database_cluster` — Postgres (set `DATABASE_URL`, run `docs/migrations/*.sql`)
- `digitalocean_database_redis` or Upstash — `RATE_LIMIT_REDIS_URL` / `REDIS_QUEUE_URL`
- `digitalocean_spaces_bucket` (optional) — audit / baseline artefacts

Pin **versions**, use **remote state** (Spaces/S3 + lock table), and inject secrets via Terraform → Doppler or DO “App Secrets”, never plain in `.tf` files.
