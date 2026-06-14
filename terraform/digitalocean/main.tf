# Optional DigitalOcean managed Postgres / Valkey for Blackglass.
# Defaults: no billable resources. See README.md in this directory.
#
# Production values (lon1 / db-s-1vcpu-1gb) are the defaults so that
# `terraform apply -var="create_managed_postgres=true"` produces a cluster
# that matches the production deployment without extra flags.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.46"
    }
  }
}

# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------

variable "do_token" {
  type        = string
  sensitive   = true
  description = "DigitalOcean API token. Pass via TF_VAR_do_token or -var."
}

variable "region" {
  type        = string
  default     = "lon1"
  description = "DigitalOcean region slug — matches the App Platform deployment region."
}

variable "create_managed_postgres" {
  type        = bool
  default     = false
  description = "When true, provisions a billable DO Managed PostgreSQL cluster."
}

variable "create_managed_valkey" {
  type        = bool
  default     = false
  description = "When true, provisions a billable DO Managed Valkey cluster (Redis-compatible)."
}

variable "postgres_cluster_name" {
  type        = string
  default     = "blackglass-pg"
  description = "Name of the Postgres cluster. Must be unique within the account."
}

variable "postgres_size" {
  type        = string
  default     = "db-s-1vcpu-1gb"
  description = "DO database size slug. See: doctl databases options slugs --engine pg"
}

variable "postgres_version" {
  type        = string
  default     = "16"
  description = "Major Postgres version."
}

variable "postgres_db_name" {
  type        = string
  default     = "blackglass"
  description = "Logical database name created inside the cluster for the application."
}

variable "postgres_app_user" {
  type        = string
  default     = "blackglass"
  description = "Database user created for the application (separate from doadmin)."
}

variable "valkey_cluster_name" {
  type        = string
  default     = "blackglass-redis"
  description = "Name of the Valkey cluster. Matches provision-do-redis.ps1 default."
}

variable "valkey_size" {
  type        = string
  default     = "db-s-1vcpu-1gb"
  description = "DO database size slug for Valkey."
}

variable "valkey_version" {
  type        = string
  default     = "8"
  description = "Valkey major version."
}

variable "app_platform_app_id" {
  type        = string
  default     = ""
  description = "DO App Platform app UUID.  When set, the App Platform is added as a trusted source on both clusters."
}

# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------

provider "digitalocean" {
  token = var.do_token
}

# ---------------------------------------------------------------------------
# Postgres cluster
# ---------------------------------------------------------------------------

resource "digitalocean_database_cluster" "postgres" {
  count      = var.create_managed_postgres ? 1 : 0

  name       = var.postgres_cluster_name
  engine     = "pg"
  version    = var.postgres_version
  size       = var.postgres_size
  region     = var.region
  node_count = 1
  tags       = ["blackglass", "terraform"]
}

# Logical database used by the application (separate from the default "defaultdb")
resource "digitalocean_database_db" "app_db" {
  count      = var.create_managed_postgres ? 1 : 0
  cluster_id = digitalocean_database_cluster.postgres[0].id
  name       = var.postgres_db_name
}

# Dedicated app user (principle of least privilege vs doadmin)
resource "digitalocean_database_user" "app_user" {
  count      = var.create_managed_postgres ? 1 : 0
  cluster_id = digitalocean_database_cluster.postgres[0].id
  name       = var.postgres_app_user
}

# Allow App Platform to reach Postgres (when app_platform_app_id is set)
resource "digitalocean_database_firewall" "postgres" {
  count      = (var.create_managed_postgres && var.app_platform_app_id != "") ? 1 : 0
  cluster_id = digitalocean_database_cluster.postgres[0].id

  rule {
    type  = "app"
    value = var.app_platform_app_id
  }
}

# ---------------------------------------------------------------------------
# Valkey cluster (Redis-compatible — used for BullMQ queues + rate limiting)
# ---------------------------------------------------------------------------

resource "digitalocean_database_cluster" "valkey" {
  count      = var.create_managed_valkey ? 1 : 0

  name       = var.valkey_cluster_name
  engine     = "valkey"
  version    = var.valkey_version
  size       = var.valkey_size
  region     = var.region
  node_count = 1
  tags       = ["blackglass", "terraform"]
}

# Allow App Platform to reach Valkey
resource "digitalocean_database_firewall" "valkey" {
  count      = (var.create_managed_valkey && var.app_platform_app_id != "") ? 1 : 0
  cluster_id = digitalocean_database_cluster.valkey[0].id

  rule {
    type  = "app"
    value = var.app_platform_app_id
  }
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "postgres_cluster_id" {
  description = "Cluster UUID — put this in DO_DB_CLUSTER_ID (.github/workflows/db-migrate.yml)."
  value       = try(digitalocean_database_cluster.postgres[0].id, null)
}

output "postgres_uri" {
  description = "Sensitive Postgres URI for DATABASE_URL (includes port 25060 for direct PG — use this for migrations)."
  value       = try(digitalocean_database_cluster.postgres[0].uri, null)
  sensitive   = true
}

output "postgres_private_uri" {
  description = "Sensitive private-network Postgres URI (App Platform → VPC). Map to DATABASE_URL for the running app."
  value       = try(digitalocean_database_cluster.postgres[0].private_uri, null)
  sensitive   = true
}

output "valkey_cluster_id" {
  description = "Valkey cluster UUID — put this in DO_REDIS_CLUSTER_ID for the mothball/rebuild scripts."
  value       = try(digitalocean_database_cluster.valkey[0].id, null)
}

output "valkey_uri" {
  description = "Sensitive Valkey URI for RATE_LIMIT_REDIS_URL and REDIS_QUEUE_URL."
  value       = try(digitalocean_database_cluster.valkey[0].uri, null)
  sensitive   = true
}

output "status" {
  description = "Human-readable provisioning summary."
  value = format(
    "managed_postgres=%s managed_valkey=%s region=%s pg_db=%s pg_user=%s",
    var.create_managed_postgres ? "enabled" : "disabled",
    var.create_managed_valkey   ? "enabled" : "disabled",
    var.region,
    var.postgres_db_name,
    var.postgres_app_user,
  )
}
