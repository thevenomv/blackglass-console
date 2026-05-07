# BLACKGLASS Helm Chart

Self-hosted Kubernetes distribution of the BLACKGLASS console + workers.

## What gets deployed

| Workload         | Purpose                                                 | Image            | Replicas |
|------------------|---------------------------------------------------------|------------------|----------|
| `*-web`          | Next.js console (HTTP)                                  | `blackglass-web` | 2        |
| `*-scan-worker`  | BullMQ consumer for SSH fan-out + drift compute         | `blackglass-worker` | 2     |
| `*-ops-worker`   | Webhook delivery, retention sweep, data exports         | `blackglass-worker` | 1     |

Plus: ConfigMap (non-secret env), Secret (envFrom), Service, optional Ingress, optional HPA, optional NetworkPolicy, ServiceAccount.

## Prerequisites

- Kubernetes 1.27+
- Helm 3.12+
- An ingress controller (nginx, Traefik, or DigitalOcean / AWS / GCP cloud LB) if `ingress.enabled=true`
- A managed Postgres instance (e.g. DigitalOcean Managed Postgres, RDS, Cloud SQL, Neon)
- A managed Redis instance (e.g. DigitalOcean Managed Redis, ElastiCache, Memorystore)
- BLACKGLASS container images pushed to a registry the cluster can pull from

> **Do not run the bundled `postgresql.enabled` / `redis.enabled` flags in production.** They exist only for offline POCs. Production deployments should always point at managed services.

## Quickstart

```bash
# 1. Create the secret out-of-band so it doesn't end up in helm values
kubectl create namespace blackglass
kubectl -n blackglass create secret generic blackglass-env \
  --from-env-file=./prod.env

# 2. Install the chart
helm install blackglass ./deploy/helm/blackglass \
  --namespace blackglass \
  --set image.web.tag=v1.2.3 \
  --set image.worker.tag=v1.2.3 \
  --set ingress.host=blackglass.example.com \
  --set secrets.existingSecret=blackglass-env

# 3. Verify
kubectl -n blackglass get pods,svc,ingress -l app.kubernetes.io/instance=blackglass
```

## Required env vars (in the Secret)

| Variable                              | Purpose                                          |
|---------------------------------------|--------------------------------------------------|
| `DATABASE_URL`                        | Postgres URL (`postgres://...`)                  |
| `REDIS_URL`                           | Redis URL (web tier)                             |
| `REDIS_QUEUE_URL`                     | Redis URL (workers — can be same as `REDIS_URL`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`   | Clerk frontend key (SaaS mode)                   |
| `CLERK_SECRET_KEY`                    | Clerk backend key                                |
| `CLERK_WEBHOOK_SECRET`                | Clerk webhook signing (svix)                     |
| `STRIPE_SECRET_KEY`                   | Stripe API key                                   |
| `STRIPE_WEBHOOK_SECRET`               | Stripe webhook signing secret                    |
| `WEBHOOK_SECRET`                      | HMAC fallback for outbound webhooks              |

Per-tenant signing keys (set via Settings → Webhook signing key) override `WEBHOOK_SECRET`.

## Optional integrations

| Variable                             | Effect                                                        |
|--------------------------------------|---------------------------------------------------------------|
| `PD_SENTRY_BRIDGE_ENABLED=true`      | Page on Sentry server errors via PagerDuty Events v2          |
| `PD_ROUTING_KEY=...`                 | PagerDuty routing key (also reused for the Sentry bridge)     |
| `OTEL_EXPORTER_OTLP_ENDPOINT=...`    | Forward server-side spans to your OTLP collector              |
| `COLLECTOR_EGRESS_IPS=ip,ip,ip`      | Comma-separated NAT IPs (surfaced to customers)               |
| `ROTATION_OVERLAP_HOURS=24`          | Webhook signing-key dual-sign window                          |

## Image lifecycle

- Pin `image.web.tag` and `image.worker.tag` to release SHAs — the chart will fail the install if either is empty so `latest` can never reach production.
- Use `imagePullSecrets` for private registries:

```yaml
image:
  pullSecrets:
    - name: regcred
```

## Upgrade

```bash
helm upgrade blackglass ./deploy/helm/blackglass \
  --namespace blackglass \
  --reuse-values \
  --set image.web.tag=v1.3.0 \
  --set image.worker.tag=v1.3.0
```

The chart fingerprints the ConfigMap + Secret into pod annotations, so a `helm upgrade` that only changes env vars triggers a rolling restart automatically.

## Uninstall

```bash
helm uninstall blackglass --namespace blackglass
```

Database, Redis, and the externally-managed `blackglass-env` Secret are not deleted.

## Production hardening checklist

- [ ] Secrets managed via External Secrets Operator / Sealed Secrets / Vault Agent — not via `--set-string secrets.values`
- [ ] `image.pullPolicy=IfNotPresent` and image tags are SHA-pinned (`@sha256:...`)
- [ ] HPA enabled (`web.hpa.enabled=true`) with realistic min/max for your traffic
- [ ] NetworkPolicy enabled (`networkPolicy.enabled=true`) restricting ingress to the namespace
- [ ] PodDisruptionBudget set externally so rolling node updates don't take both web replicas down
- [ ] Backups configured on the managed Postgres + Redis (we do NOT manage these)
- [ ] `OTEL_EXPORTER_OTLP_ENDPOINT` pointing at your APM stack so you can correlate latency
- [ ] `PD_SENTRY_BRIDGE_ENABLED=true` so on-call gets paged on server errors
