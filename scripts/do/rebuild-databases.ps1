#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Recreate the Blackglass DigitalOcean managed databases from a mothball
    config file produced by mothball-databases.ps1.

.DESCRIPTION
    Reads scripts/do/mothball-config.json (or a path you specify) and:

    1. Creates a DO Managed Postgres cluster with the same region / size /
       version as recorded in the config.
    2. Creates a DO Managed Valkey cluster (if recorded in the config).
    3. Waits for both clusters to reach "online" status (typically 2–5 min).
    4. Restores firewall rules for App Platform (if -AppId is provided).
    5. Prints the new connection URIs and the exact commands needed to:
         a. Update Doppler / DO App Platform secrets.
         b. Run database migrations (npm run db:migrate).
         c. Optionally restore data from the pg_dump in Spaces.

    This script does NOT run migrations or restore data automatically —
    those steps involve your live secrets which should not be in scripts.

.PARAMETER Token
    DigitalOcean Personal Access Token (read+write).
    Defaults to $env:DIGITALOCEAN_ACCESS_TOKEN.

.PARAMETER Config
    Path to the mothball config JSON.
    Default: scripts/do/mothball-config.json

.PARAMETER AppId
    DO App Platform app ID.  Used to restore the App Platform trusted-source
    firewall rule so the app can reach the new clusters.
    Defaults to $env:BLACKGLASS_APP_ID.

.PARAMETER ClusterNameSuffix
    Optional suffix appended to cluster names to avoid collision if the old
    names still exist (e.g. "-2026" → "blackglass-pg-2026").
    Default: empty string (use original name).

.PARAMETER SkipValkey
    Skip recreating the Valkey/Redis cluster.

.PARAMETER WaitTimeoutMin
    Maximum minutes to wait for clusters to come online.  Default: 10.

.EXAMPLE
    # Minimal — uses env vars and default config path
    $env:DIGITALOCEAN_ACCESS_TOKEN = "dop_v1_..."
    $env:BLACKGLASS_APP_ID         = "526a574e-..."
    .\scripts\do\rebuild-databases.ps1

    # Explicit paths / ids
    .\scripts\do\rebuild-databases.ps1 `
        -Config  scripts/do/mothball-config.json `
        -AppId   "526a574e-..." `
        -Token   "dop_v1_..."

    # Rebuild with a name suffix to avoid collision during testing
    .\scripts\do\rebuild-databases.ps1 -ClusterNameSuffix "-rebuild-$(Get-Date -Format yyyyMMdd)"
#>

param(
    [string]$Token               = $env:DIGITALOCEAN_ACCESS_TOKEN,
    [string]$Config              = "scripts/do/mothball-config.json",
    [string]$AppId               = ($env:BLACKGLASS_APP_ID ?? ""),
    [string]$ClusterNameSuffix   = "",
    [switch]$SkipValkey,
    [int]   $WaitTimeoutMin      = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $Token)  { Write-Error "Set -Token or `$env:DIGITALOCEAN_ACCESS_TOKEN"; exit 1 }
if (-not (Test-Path $Config)) {
    Write-Error "Config file not found: $Config`nRun mothball-databases.ps1 first to generate it."
    exit 1
}

$Headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type"  = "application/json"
}
$DoApi = "https://api.digitalocean.com/v2"
$cfg   = Get-Content $Config | ConvertFrom-Json

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Invoke-Do {
    param([string]$Method, [string]$Path, [object]$Body = $null)
    $uri = "$DoApi/$Path"
    $splat = @{ Method = $Method; Uri = $uri; Headers = $Headers }
    if ($Body -ne $null) { $splat["Body"] = ($Body | ConvertTo-Json -Depth 10) }
    try {
        return Invoke-RestMethod @splat
    } catch {
        $status = $_.Exception.Response?.StatusCode?.value__ ?? "?"
        $detail = $_.ErrorDetails?.Message ?? $_.Exception.Message
        throw "DO API $Method $Path => HTTP $status : $detail"
    }
}

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Write-Ok([string]$Text)   { Write-Host "    [ok] $Text" -ForegroundColor Green }
function Write-Info([string]$Text) { Write-Host "    $Text" }

function Wait-ClusterOnline([string]$ClusterId, [string]$ClusterName) {
    Write-Info "Waiting for '$ClusterName' to come online (timeout: ${WaitTimeoutMin}m) …"
    $deadline  = (Get-Date).AddMinutes($WaitTimeoutMin)
    $pollSec   = 15

    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds $pollSec
        try {
            $status = (Invoke-Do "GET" "databases/$ClusterId").database.status
        } catch {
            Write-Info "  [poll error] $_"
            continue
        }
        Write-Info "  status: $status"
        if ($status -eq "online") { return $true }
    }
    Write-Host "  [timeout] Cluster still not online after ${WaitTimeoutMin}m." -ForegroundColor Yellow
    return $false
}

function Add-AppFirewallRule([string]$ClusterId, [string]$AppPlatformId) {
    if (-not $AppPlatformId) { return }
    Write-Info "Adding App Platform ($AppPlatformId) trusted source …"
    $rules = @( @{ type = "app"; value = $AppPlatformId } )

    # Also re-add any ip/tag rules from the mothball config that aren't the old cluster ref
    # (we skip them here — operator should re-add custom IP rules manually)
    try {
        Invoke-Do "PUT" "databases/$ClusterId/firewall" @{ rules = $rules } | Out-Null
        Write-Ok "App Platform trusted source added."
    } catch {
        Write-Host "    [warn] Could not set firewall: $_" -ForegroundColor Yellow
        Write-Host "    [warn] Add manually: DO console → Databases → $ClusterId → Firewalls" -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------------------------
# Validate config
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "==> Mothball rebuild" -ForegroundColor Cyan
Write-Host "    Config      : $Config"
Write-Host "    Mothballed  : $($cfg.mothballedAt)"
if ($cfg.pgDump) {
    Write-Host "    pg_dump key : $($cfg.pgDump.spacesKey)"
}
Write-Host ""

# ---------------------------------------------------------------------------
# Step 1 — Create Postgres cluster
# ---------------------------------------------------------------------------
Write-Step "Creating Postgres cluster …"

$pgCfg  = $cfg.postgres
$pgName = "$($pgCfg.clusterName)$ClusterNameSuffix"

Write-Info "Name    : $pgName"
Write-Info "Region  : $($pgCfg.region)"
Write-Info "Size    : $($pgCfg.size)"
Write-Info "Engine  : $($pgCfg.engine) $($pgCfg.version)"
Write-Info "Nodes   : $($pgCfg.nodeCount)"

$pgBody = @{
    name       = $pgName
    engine     = $pgCfg.engine
    version    = $pgCfg.version
    region     = $pgCfg.region
    size       = $pgCfg.size
    num_nodes  = $pgCfg.nodeCount
    tags       = @($pgCfg.tags)
}

$pgResp       = Invoke-Do "POST" "databases" $pgBody
$newPgId      = $pgResp.database.id
$newPgUri     = $pgResp.database.connection.uri
$newPgPrivUri = $pgResp.database.private_connection?.uri ?? ""

Write-Ok "Cluster created: $newPgId (status: $($pgResp.database.status))"

# Wait for online
$pgOnline = Wait-ClusterOnline $newPgId $pgName
if ($pgOnline) { Write-Ok "Postgres is online." }

# Re-read the URI (may populate after online)
$pgFull       = (Invoke-Do "GET" "databases/$newPgId").database
$newPgUri     = $pgFull.connection.uri
$newPgPrivUri = $pgFull.private_connection?.uri ?? ""

# ---------------------------------------------------------------------------
# Step 2 — Create logical DB and user (if recorded)
# ---------------------------------------------------------------------------
$logicalDb = ($pgCfg.logicalDbs | Where-Object { $_ -ne "defaultdb" -and $_ -ne "_dodb" } | Select-Object -First 1)
if (-not $logicalDb) { $logicalDb = "blackglass" }

Write-Step "Creating logical database '$logicalDb' …"
try {
    Invoke-Do "POST" "databases/$newPgId/dbs" @{ name = $logicalDb } | Out-Null
    Write-Ok "Logical DB '$logicalDb' created."
} catch {
    Write-Host "    [warn] $_" -ForegroundColor Yellow
}

$appUser = ($pgCfg.appUsers | Select-Object -First 1)
if ($appUser) {
    Write-Step "Creating database user '$appUser' …"
    try {
        $userResp = Invoke-Do "POST" "databases/$newPgId/users" @{ name = $appUser }
        Write-Ok "User '$appUser' created."
        Write-Info "Password auto-generated by DO — retrieve from the DO console or API."
    } catch {
        Write-Host "    [warn] $_" -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------------------------
# Step 3 — Firewall (App Platform trusted source)
# ---------------------------------------------------------------------------
Write-Step "Setting Postgres firewall rules …"
Add-AppFirewallRule $newPgId $AppId

# ---------------------------------------------------------------------------
# Step 4 — Create Valkey cluster
# ---------------------------------------------------------------------------
$newVkId  = $null
$newVkUri = $null

if (-not $SkipValkey -and $cfg.valkey) {
    Write-Step "Creating Valkey cluster …"
    $vkCfg  = $cfg.valkey
    $vkName = "$($vkCfg.clusterName)$ClusterNameSuffix"

    Write-Info "Name    : $vkName"
    Write-Info "Region  : $($vkCfg.region)"
    Write-Info "Size    : $($vkCfg.size)"
    Write-Info "Engine  : $($vkCfg.engine) $($vkCfg.version)"

    $vkBody = @{
        name      = $vkName
        engine    = $vkCfg.engine
        version   = $vkCfg.version
        region    = $vkCfg.region
        size      = $vkCfg.size
        num_nodes = $vkCfg.nodeCount
        tags      = @($vkCfg.tags)
    }

    $vkResp  = Invoke-Do "POST" "databases" $vkBody
    $newVkId = $vkResp.database.id
    Write-Ok "Cluster created: $newVkId (status: $($vkResp.database.status))"

    $vkOnline = Wait-ClusterOnline $newVkId $vkName
    if ($vkOnline) { Write-Ok "Valkey is online." }

    $vkFull   = (Invoke-Do "GET" "databases/$newVkId").database
    $newVkUri = $vkFull.connection.uri

    Write-Step "Setting Valkey firewall rules …"
    Add-AppFirewallRule $newVkId $AppId
} elseif ($SkipValkey) {
    Write-Host ""
    Write-Host "    [skip] Valkey creation skipped (-SkipValkey)." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "    [skip] No Valkey config in mothball file." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Step 5 — Update db-migrate.yml cluster ID hint
# ---------------------------------------------------------------------------
Write-Step "Updating .github/workflows/db-migrate.yml cluster ID …"
$wfPath = ".github/workflows/db-migrate.yml"
if (Test-Path $wfPath) {
    $wf = Get-Content $wfPath -Raw
    $wf = $wf -replace "DO_DB_CLUSTER_ID:.*", "DO_DB_CLUSTER_ID: `"$newPgId`""
    Set-Content $wfPath $wf -Encoding UTF8 -NoNewline
    Write-Ok "Updated $wfPath with new cluster ID: $newPgId"
} else {
    Write-Host "    [warn] $wfPath not found — update DO_DB_CLUSTER_ID manually." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Step 6 — Print next steps
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host " REBUILD COMPLETE — next steps" -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Green
Write-Host ""
Write-Host " New Postgres cluster : $newPgId" -ForegroundColor White
Write-Host " New Postgres URI     : (retrieve from DO console — treat as secret)" -ForegroundColor White
if ($newVkId) {
    Write-Host " New Valkey  cluster  : $newVkId" -ForegroundColor White
    Write-Host " New Valkey  URI      : (retrieve from DO console — treat as secret)" -ForegroundColor White
}
Write-Host ""
Write-Host " ─── 1. Update secrets ──────────────────────────────────────────────"
Write-Host " In Doppler (production config):"
Write-Host "   DATABASE_URL      = <new postgres URI from DO console>  (port 25060)"
Write-Host "   RATE_LIMIT_REDIS_URL = <new valkey URI>"
Write-Host "   REDIS_QUEUE_URL   = <same valkey URI>"
Write-Host ""
Write-Host " Or via doctl (App Platform):"
if ($AppId) {
    Write-Host "   doctl apps update $AppId --spec .do\app-git.production.yaml"
} else {
    Write-Host "   doctl apps update <YOUR_APP_ID> --spec .do\app-git.production.yaml"
}
Write-Host ""
Write-Host " ─── 2. Run migrations ──────────────────────────────────────────────"
Write-Host " IMPORTANT: Use port 25060 (direct Postgres), NOT 25061 (pgBouncer)."
Write-Host "   DATABASE_URL=<pg-uri-port-25060> npm run db:migrate"
Write-Host " Or trigger the GitHub Actions workflow:"
Write-Host "   gh workflow run db-migrate.yml -f mode=apply"
Write-Host ""
Write-Host " ─── 3. Restore data (if fresh cluster, not PITR) ───────────────────"
if ($cfg.pgDump) {
    Write-Host " A pg_dump was captured at mothball time:"
    Write-Host "   Spaces key : $($cfg.pgDump.spacesKey)"
    Write-Host " Download from DO Spaces and restore:"
    Write-Host "   aws --endpoint-url <DO_SPACES_ENDPOINT> s3 cp s3://<bucket>/$($cfg.pgDump.spacesKey) restore.sql.gz"
    Write-Host "   gunzip restore.sql.gz"
    Write-Host "   psql <DATABASE_URL> -f restore.sql"
    Write-Host " Then re-run migrations to apply any schema changes:"
    Write-Host "   npm run db:migrate"
} else {
    Write-Host " No pg_dump was recorded in the mothball config."
    Write-Host " Restore manually from DO managed backups (if still within 7-day window)"
    Write-Host " or from your own backup source."
}
Write-Host ""
Write-Host " ─── 4. Verify ──────────────────────────────────────────────────────"
Write-Host "   node scripts/ops/verify-partition-integrity.mjs"
Write-Host "   curl https://<app-url>/api/health"
Write-Host "   npm run verify:staging   (against staging)"
Write-Host ""
Write-Host " ─── 5. Deploy ───────────────────────────────────────────────────────"
Write-Host "   doctl apps create-deployment <app-id>"
Write-Host "   # or push to main to trigger the CI/CD pipeline"
Write-Host ""
