# DigitalOcean managed data plane (optional Terraform)

This module is an **opt-in starter** for teams that want **managed Postgres** and/or **managed Valkey** (Redis-compatible protocol) on DigitalOcean alongside the application (App Platform, Droplets, or Kubernetes).

## Important

- **Creating clusters is billable.** Defaults keep `create_managed_postgres` and `create_managed_valkey` set to `false` so `terraform plan` shows no managed resources until you deliberately opt in.
- **Tokens are sensitive.** Use `TF_VAR_do_token`, environment variables, or a remote backend with locked state — never commit real tokens.

## Prerequisites

- [Terraform](https://www.terraform.io/) `>= 1.5`
- A DigitalOcean API token with permission to manage databases (and read account if your org requires it)

## Usage

```bash
cd terraform/digitalocean
terraform init
export TF_VAR_do_token="dop_v1_..."   # or use -var="do_token=..."
terraform plan
# After reviewing DO pricing and naming:
terraform apply -var="create_managed_postgres=true"
# Optional Redis-protocol queue / rate-limit tier (Valkey):
# terraform apply -var="create_managed_valkey=true"
```

Copy the sensitive output connection strings into your secrets manager (Doppler, DO Secrets, Vault) and map them to `DATABASE_URL`, `REDIS_QUEUE_URL`, and `RATE_LIMIT_REDIS_URL` (Valkey URIs use the same Redis URL format expected by BullMQ and the rate limiter) as described in the root `.env.example` and [docs/operations/operator-guide.md](../../docs/operations/operator-guide.md).

## Outputs

When a cluster is created, Terraform exposes **sensitive** URIs for wiring into the app. Rotate credentials through the DO control panel if they are ever leaked.

## Relationship to other IaC

- **Kubernetes self-hosted:** prefer [deploy/helm/blackglass](../../deploy/helm/blackglass) for the workload; this Terraform module addresses only common DO **managed** data services some teams want alongside Helm.
