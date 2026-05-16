# Deployment topology

BLACKGLASS ships **one application** but three deployable artefacts and three
target environments. This page is the single source of truth for "where is X
provisioned and which spec owns it?"

## Workloads

| Workload | Source | Inbound | Outbound | Notes |
|---|---|---|---|---|
| **Web (Next.js)** | `src/app/`, `src/middleware.ts` | HTTPS via Cloudflare | Postgres, Redis, Resend, Stripe, Clerk, Sentry, DigitalOcean Spaces | RSC + Route Handlers; standalone output (`next.config.ts` → `output: "standalone"`) |
| **Scan worker** | `src/worker/scan/index.ts` | None | Postgres, Redis (BullMQ `scan-jobs` queue), SSH to fleet hosts | One process per shard; pulls baselines via SSH |
| **Ops worker** | `src/worker/ops/index.ts` | None | Postgres, Redis (BullMQ `outbound-webhooks`, `blackglass-janitor`, etc.), Resend, Stripe, AWS-API clients | Handles webhook delivery, audit export, Charon (cloud janitor) scans, retention sweeps |
| **Sandbox worker** | `src/worker/sandbox/index.ts` | None | Cloud APIs (provider varies), Redis | Spins up time-bound sandboxes; gated by tenant plan |

## Targets

There are **three** active deployment specs. They are **not** alternatives to
each other — they target different runtimes and lifecycles.

### 1. DigitalOcean App Platform (production + staging) — primary

- **Spec:** `.do/app-git.production.yaml`, `.do/app-git.staging.yaml`
- **Bootstrap:** `.do/app-create.phase1.json` + `scripts/do/do_bootstrap_blackglass.py`
- **Apply:**
  ```bash
  doctl apps create --spec .do/app-git.production.yaml
  doctl apps update <app-id> --spec .do/app-git.production.yaml
  ```
- **Stage-0 settings (one-off):** `python scripts/do/do_apply_stage0.py`
- **What it provisions:** the web + ops-worker + scan-worker services. Postgres and Redis are **external** managed DBs configured via env.
- **Cold paths:** push-ingest agent (`scripts/systemd/blackglass-agent.sh`) — when the platform's egress blackholes outbound SSH to user Droplets, hosts POST to `/api/v1/ingest/agent` instead.

### 2. Helm chart (self-hosted Kubernetes) — for on-prem customers

- **Spec:** `deploy/helm/blackglass/` (`Chart.yaml`, `values.yaml`, `templates/`)
- **Apply:**
  ```bash
  helm install blackglass ./deploy/helm/blackglass \
    --namespace blackglass --create-namespace \
    --set image.web.tag=v1.2.3 \
    --set image.worker.tag=v1.2.3 \
    --set ingress.host=blackglass.example.com \
    --set-file secrets.envFile=./prod.env
  ```
- **What it provisions:** all three Deployments (`web`, `scan-worker`, `ops-worker`, `sandbox-worker`), an HPA for the web tier, an Ingress, a NetworkPolicy, a ServiceAccount, and a single Secret object holding service credentials. Postgres and Redis are **external** by default; the chart can optionally bundle them but production deployments should always point at managed services.
- **Used by:** customers who run BLACKGLASS in their own VPC.

### 3. Terraform (DigitalOcean managed services) — out-of-band infra

- **Spec:** `terraform/digitalocean/main.tf`
- **Apply:** standard `terraform init && terraform plan && terraform apply`
- **What it provisions:** the DigitalOcean **resources** the App Platform spec assumes exist — managed Postgres, managed Redis, Spaces bucket, project tagging, firewall rules.
- **Run order:** Terraform first → grab the connection strings → set them as Doppler / DO App Platform secrets → run the App Platform spec.

## Image / build flow

```
GitHub push (main / staging)
   │
   ├──► DO App Platform: builds container in-platform (`npm ci && npm run build`),
   │       hot-deploys the new revision behind a rolling restart.
   │
   └──► (Future) GHCR: tagged release builds the worker bundle (esbuild)
           via `scripts/build/build-worker.mjs` → published as an OCI image
           consumed by the Helm chart.
```

## Secret stores

| Where | Stores | Notes |
|---|---|---|
| **Doppler** (primary in dev / staging) | All service credentials, signing keys | `npm run dev:doppler` injects locally; CI uses `DOPPLER_TOKEN`. See [`operations/doppler-digitalocean-setup.md`](../operations/doppler-digitalocean-setup.md). |
| **DigitalOcean App Platform secrets** | Production runtime secrets | Mirrored from Doppler at deploy time. |
| **Kubernetes Secret (`blackglass-secrets`)** | Self-hosted runtime secrets | Created by Helm from `--set-file secrets.envFile`. |
| **AWS KMS / per-tenant DEK** | Customer-data envelopes | See [`security/data-retention-saas.md`](../security/data-retention-saas.md) and `src/lib/server/envelope`. |
| **`.local/` (operator machine only)** | Lab keys, prospect CSVs, scratch | Not in git; convention enforced via `.gitignore`. |

## Migration ownership

| What | Owner | Apply with |
|---|---|---|
| SaaS schema (multi-tenant) | Drizzle (`drizzle/0000_*` … `drizzle/0026_*`) | `npm run db:migrate` |
| Legacy single-tenant audit / baseline tables | Hand-applied SQL in `docs/sql/` | `psql -f docs/sql/<file>.sql` (see [`sql/README.md`](../sql/README.md)) |
| Out-of-band patches (e.g. `ALTER TYPE ADD VALUE`) | Hand-applied SQL in `docs/sql/` | `npm run db:migrate:008` |

## Related runbooks

- [`operations/staging-deployment-checklist.md`](../operations/staging-deployment-checklist.md) — pre-flight before each staging cutover.
- [`operations/release-checklist.md`](../operations/release-checklist.md) — what must be true before tagging a release.
- [`operations/doppler-digitalocean-setup.md`](../operations/doppler-digitalocean-setup.md) — env wiring.
- [`runbooks/deploy-scan-worker.md`](../runbooks/deploy-scan-worker.md) — worker-specific rollout.
- [`operations/operator-guide.md`](../operations/operator-guide.md) — day-2 ops.
