#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Provision a DigitalOcean Managed Redis (Valkey) cluster for BLACKGLASS.

.DESCRIPTION
    Creates a DO Managed Redis 7 cluster in the same region as your App Platform
    deployment, prints the connection string, and outputs the doctl commands to
    add the App Platform trusted source and set the secret env vars on the app.

.PARAMETER Token
    DigitalOcean Personal Access Token (read/write).  Defaults to $env:DIGITALOCEAN_ACCESS_TOKEN.

.PARAMETER Region
    DO region slug.  Default: lon1  (change to match your App Platform region).

.PARAMETER ClusterName
    Name for the Redis cluster.  Default: blackglass-redis.

.PARAMETER AppId
    DO App Platform app ID.  Defaults to $env:BLACKGLASS_APP_ID.

.EXAMPLE
    # Minimal — uses env vars
    $env:DIGITALOCEAN_ACCESS_TOKEN = "dop_v1_..."
    $env:BLACKGLASS_APP_ID = "526a574e-..."
    .\scripts\provision-do-redis.ps1

    # Explicit
    .\scripts\provision-do-redis.ps1 -Token dop_v1_... -Region lon1 -AppId 526a574e-...
#>
param(
    [string]$Token      = $env:DIGITALOCEAN_ACCESS_TOKEN,
    [string]$Region     = "lon1",
    [string]$ClusterName = "blackglass-redis",
    [string]$AppId      = $env:BLACKGLASS_APP_ID
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $Token)  { Write-Error "Set -Token or `$env:DIGITALOCEAN_ACCESS_TOKEN"; exit 1 }
if (-not $AppId)  { Write-Warning "AppId not set — skipping trusted-source and env-var steps." }

$headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type"  = "application/json"
}

# ---------------------------------------------------------------------------
# 1. Create the cluster
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "==> Creating Managed Redis cluster '$ClusterName' in region $Region ..." -ForegroundColor Cyan

$body = @{
    name          = $ClusterName
    engine        = "valkey"
    version       = "8"
    region        = $Region
    size          = "db-s-1vcpu-1gb"
    num_nodes     = 1
    tags          = @("blackglass")
} | ConvertTo-Json -Depth 5

$response = Invoke-RestMethod -Method Post `
    -Uri "https://api.digitalocean.com/v2/databases" `
    -Headers $headers `
    -Body $body

$clusterId  = $response.database.id
$clusterUri = $response.database.connection.uri

Write-Host "  Cluster ID : $clusterId" -ForegroundColor Green
Write-Host "  Status     : $($response.database.status) (will become 'online' in ~2 min)"
Write-Host ""

# ---------------------------------------------------------------------------
# 2. Add App Platform as a trusted source  (if AppId provided)
# ---------------------------------------------------------------------------
if ($AppId) {
    Write-Host "==> Adding App Platform ($AppId) as trusted source ..." -ForegroundColor Cyan
    $tsBody = @{
        rules = @(@{ type = "app"; value = $AppId })
    } | ConvertTo-Json -Depth 5

    try {
        Invoke-RestMethod -Method Put `
            -Uri "https://api.digitalocean.com/v2/databases/$clusterId/firewall" `
            -Headers $headers `
            -Body $tsBody | Out-Null
        Write-Host "  Trusted source added." -ForegroundColor Green
    } catch {
        Write-Warning "Could not set trusted source (cluster may still be provisioning). Re-run or add manually in the DO console."
    }
}

# ---------------------------------------------------------------------------
# 3. Print the connection string and next-step commands
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "==> Redis cluster ready.  Connection URI (treat as a secret):" -ForegroundColor Yellow
Write-Host "  $clusterUri"
Write-Host ""
Write-Host "==> Next steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Copy the URI above and set it as a SECRET in your App Platform environment:"
Write-Host "       RATE_LIMIT_REDIS_URL = <uri>"
Write-Host "       REDIS_QUEUE_URL      = <uri>  (same cluster is fine for this scale)"
Write-Host ""
if ($AppId) {
    Write-Host "  2. Update the app spec to activate the scan worker:"
    Write-Host "       doctl apps update $AppId --spec .do\app-git.production.yaml"
    Write-Host ""
    Write-Host "  3. Set the env vars via doctl (or paste in the DO console):"
    Write-Host "       doctl apps update $AppId --spec .do\app-git.production.yaml"
} else {
    Write-Host "  2. Set BLACKGLASS_APP_ID and re-run, or set env vars manually in the DO console."
}
Write-Host ""
Write-Host "  Cluster ID saved for reference: $clusterId"
Write-Host "  To delete: doctl databases delete $clusterId"
Write-Host ""
