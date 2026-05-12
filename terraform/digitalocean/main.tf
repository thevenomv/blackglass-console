# Optional DigitalOcean managed Postgres / Valkey for Blackglass.# Defaults: no billable resources. See README.md in this directory.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.46"
    }
  }
}

variable "do_token" {
  type        = string
  sensitive   = true
  description = "DigitalOcean API token. Pass via TF_VAR_do_token or -var."
}

variable "region" {
  type        = string
  default     = "nyc3"
  description = "DigitalOcean region slug (must support chosen DB engines)."
}

variable "create_managed_postgres" {
  type        = bool
  default     = false
  description = "When true, provisions a billable DO Managed PostgreSQL cluster."
}

variable "create_managed_valkey" {
  type        = bool
  default     = false
  description = "When true, provisions a billable DO Managed Valkey cluster (Redis-compatible queues / rate limits)."
}

variable "postgres_cluster_name" {
  type    = string
  default = "blackglass-pg"
}

variable "postgres_size" {
  type    = string
  default = "db-s-1vcpu-1gb"
}

variable "valkey_cluster_name" {
  type    = string
  default = "blackglass-valkey"
}

variable "valkey_size" {
  type    = string
  default = "db-s-1vcpu-1gb"
}

provider "digitalocean" {
  token = var.do_token
}

resource "digitalocean_database_cluster" "postgres" {
  count       = var.create_managed_postgres ? 1 : 0
  name        = var.postgres_cluster_name
  engine      = "pg"
  version     = "16"
  size        = var.postgres_size
  region      = var.region
  node_count  = 1
  tags        = ["blackglass", "terraform"]
}

resource "digitalocean_database_cluster" "valkey" {
  count      = var.create_managed_valkey ? 1 : 0
  name       = var.valkey_cluster_name
  engine     = "valkey"
  version    = "8"
  size       = var.valkey_size
  region     = var.region
  node_count = 1
  tags       = ["blackglass", "terraform"]
}

output "postgres_uri" {
  description = "Sensitive Postgres connection URI (when cluster is created)."
  value       = try(digitalocean_database_cluster.postgres[0].uri, null)
  sensitive   = true
}

output "valkey_uri" {
  description = "Sensitive Valkey (Redis protocol) connection URI when cluster is created."
  value       = try(digitalocean_database_cluster.valkey[0].uri, null)
  sensitive   = true
}

output "status" {
  description = "Human-readable summary for operators."
  value = format(
    "managed_postgres=%s managed_valkey=%s region=%s",
    var.create_managed_postgres ? "enabled" : "disabled",
    var.create_managed_valkey ? "enabled" : "disabled",
    var.region,
  )
}
