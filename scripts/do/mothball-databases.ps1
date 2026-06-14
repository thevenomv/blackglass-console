#!/usr/bin/env pwsh
<#
.SYNOPSIS
    "Moth-ball" the Blackglass DigitalOcean managed databases — capture
    everything needed to recreate them, then optionally destroy the clusters
    to stop billing.

.DESCRIPTION
    This script does four things in order:

    1. CAPTURE  — calls the DO API to pull the full configuration of both
                  the Postgres and Redis/Valkey clusters (region, size, version,
                  node count, firewall rules, latest backup timestamp).
                  Writes the config to scripts/do/mothball-config.json so
                  rebuild-databases.ps1 can re-create them without guessing.

    2. SNAPSHOT — lists the most recent DO managed backup for Postgres and
                  records its timestamp in the config.  DO retains automated
                  backups for 7 days — if you need longer, re-enable the
                  cluster before that window closes and use a PITR restore.

    3. DUMP     — runs node scripts/ops/backup-postgres.mjs to pg_dump the
                  live database to DO Spaces.  This is the durable, portable
                  backup that survives cluster deletion indefinitely.
                  Skip with -SkipDump if pg_dump is unavailable locally.

    4. DESTROY  — with -Destroy, confirms once then calls DELETE on both
                  clusters to stop billing.  This cannot be undone; the DO
                  managed snapshots are also deleted.  The pg_dump in Spaces
                  and the config JSON are your only recovery path after this.

.PARAMETER Token
    DigitalOcean Personal Access Token (read+write for destroy, read for
    capture/snapshot only).  Defaults to $env:DIGITALOCEAN_ACCESS_TOKEN.

.PARAMETER PostgresClusterId
    UUID of the Postgres cluster.  Defaults to
    $env:DO_PG_CLUSTER_ID.  Falls back to the production cluster ID
    hard-coded in .github/workflows/db-migrate.yml.

.PARAMETER ValKeyClusterId
    UUID of the Valkey/Redis cluster.  Defaults to $env:DO_REDIS_CLUSTER_ID.
    If not supplied the script will attempt to discover a cluster tagged
    "blackglass" in the same region as Postgres.

.PARAMETER ConfigOutput
    Path for the mothball config JSON.
    Default: scripts/do/mothball-config.json (gitignored).

.PARAMETER SkipDump
    Skip the pg_dump step (e.g. pg_dump not on PATH locally).

.PARAMETER Destroy
    Actually delete the clusters after capturing config and dump.
    Requires explicit confirmation prompt.

.EXAMPLE
    # Capture + dump (safe read-only run — does NOT destroy)
    $env:DIGITALOCEAN_ACCESS_TOKEN = "dop_v1_..."
    .\scripts\do\mothball-databases.ps1

    # Full mothball: capture + dump + destroy
    .\scripts\do\mothball-databases.ps1 -Destroy

    # Skip pg_dump (e.g. running without postgres-client installed)
    .\scripts\do\mothball-databases.ps1 -SkipDump

    # Specify clusters explicitly
    .\scripts\do\mothball-databases.ps1 `
        -PostgresClusterId "4d063be8-1cc1-4b45-8b57-2a96a9c77161" `
        -ValKeyClusterId   "YOUR-REDIS-UUID"
#>

param(
    [string]$Token              = $env:DIGITALOCEAN_ACCESS_TOKEN,
    [string]$PostgresClusterId  = ($env:DO_PG_CLUSTER_ID    ?? "4d063be8-1cc1-4b45-8b57-2a96a9c77161"),
    [string]$ValKeyClusterId    = ($env:DO_REDIS_CLUSTER_ID ?? ""),
    [string]$ConfigOutput       = "scripts/do/mothball-config.json",
    [switch]$SkipDump,
    [switch]$Destroy,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $Token) {
    Write-Error "Set -Token or `$env:DIGITALOCEAN_ACCESS_TOKEN"
    exit 1
}

$Headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type"  = "application/json"
}
$DoApi = "https://api.digitalocean.com/v2"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Invoke-Do {
    param([string]$Method, [string]$Path, [hashtable]$Body = $null)
    $uri = "$DoApi/$Path"
    $splat = @{ Method = $Method; Uri = $uri; Headers = $Headers }
    if ($Body) { $splat["Body"] = ($Body | ConvertTo-Json -Depth 10) }
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

function Write-Ok([string]$Text) {
    Write-Host "    [ok] $Text" -ForegroundColor Green
}

function Write-Info([string]$Text) {
    Write-Host "    $Text"
}

# ---------------------------------------------------------------------------
# Step 1 — Capture Postgres cluster config
# ---------------------------------------------------------------------------
Write-Step "Fetching Postgres cluster info ($PostgresClusterId) …"

$pg = (Invoke-Do "GET" "databases/$PostgresClusterId").database

Write-Ok  "Name    : $($pg.name)"
Write-Info "Region  : $($pg.region)"
Write-Info "Size    : $($pg.size)"
Write-Info "Engine  : $($pg.engine) $($pg.version)"
Write-Info "Nodes   : $($pg.num_nodes)"
Write-Info "Status  : $($pg.status)"
Write-Info "Tags    : $($pg.tags -join ', ')"

# Firewall rules
Write-Step "Fetching Postgres firewall rules …"
$pgFw = (Invoke-Do "GET" "databases/$PostgresClusterId/firewall").rules
Write-Info "Rules   : $($pgFw.Count)"

# Databases inside the cluster
Write-Step "Fetching logical databases inside cluster …"
$pgDbs = (Invoke-Do "GET" "databases/$PostgresClusterId/dbs").dbs
Write-Info "Logical DBs: $(($pgDbs | ForEach-Object { $_.name }) -join ', ')"

# Users inside the cluster
Write-Step "Fetching database users …"
$pgUsers = (Invoke-Do "GET" "databases/$PostgresClusterId/users").users
Write-Info "Users : $(($pgUsers | Where-Object { $_.name -ne 'doadmin' } | ForEach-Object { $_.name }) -join ', ')"

# Latest backup / snapshot
Write-Step "Fetching automated backup list …"
$pgBackups = (Invoke-Do "GET" "databases/$PostgresClusterId/backups").backups
$latestBackup = $pgBackups | Sort-Object { [datetime]$_.created_at } | Select-Object -Last 1
if ($latestBackup) {
    Write-Ok  "Latest backup : $($latestBackup.created_at) ($($latestBackup.size_gigabytes) GiB)"
} else {
    Write-Host "    [warn] No automated backups found yet." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Step 2 — Discover or capture Valkey/Redis cluster config
# ---------------------------------------------------------------------------
$valkeyConfig = $null

if ($ValKeyClusterId) {
    Write-Step "Fetching Valkey cluster info ($ValKeyClusterId) …"
    try {
        $vk = (Invoke-Do "GET" "databases/$ValKeyClusterId").database
        Write-Ok  "Name   : $($vk.name)"
        Write-Info "Region : $($vk.region)"
        Write-Info "Size   : $($vk.size)"
        Write-Info "Engine : $($vk.engine) $($vk.version)"
        Write-Info "Status : $($vk.status)"

        $vkFw = (Invoke-Do "GET" "databases/$ValKeyClusterId/firewall").rules
        Write-Info "FW rules: $($vkFw.Count)"

        $valkeyConfig = @{
            clusterId   = $vk.id
            clusterName = $vk.name
            region      = $vk.region
            size        = $vk.size
            engine      = $vk.engine
            version     = $vk.version
            nodeCount   = $vk.num_nodes
            tags        = @($vk.tags)
            status      = $vk.status
            firewallRules = @($vkFw | ForEach-Object {
                @{ type = $_.type; value = $_.value; description = $_.description }
            })
        }
    } catch {
        Write-Host "    [warn] Could not fetch Valkey cluster: $_" -ForegroundColor Yellow
        Write-Host "    [warn] Continuing without Valkey config — set -ValKeyClusterId to include it." -ForegroundColor Yellow
    }
} else {
    Write-Step "No Valkey cluster ID supplied — attempting discovery (tag=blackglass) …"
    try {
        $allDbs = (Invoke-Do "GET" "databases?engine=valkey").databases
        $found  = $allDbs | Where-Object { $_.tags -contains "blackglass" } | Select-Object -First 1
        if ($found) {
            $ValKeyClusterId = $found.id
            Write-Ok "Found : $($found.name) ($ValKeyClusterId)"
            $vkFw = (Invoke-Do "GET" "databases/$ValKeyClusterId/firewall").rules
            $valkeyConfig = @{
                clusterId   = $found.id
                clusterName = $found.name
                region      = $found.region
                size        = $found.size
                engine      = $found.engine
                version     = $found.version
                nodeCount   = $found.num_nodes
                tags        = @($found.tags)
                status      = $found.status
                firewallRules = @($vkFw | ForEach-Object {
                    @{ type = $_.type; value = $_.value; description = $_.description }
                })
            }
        } else {
            Write-Host "    [warn] No Valkey cluster tagged 'blackglass' found. Skipping." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "    [warn] Discovery failed: $_" -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------------------------
# Step 3 — pg_dump → Spaces (durable portable backup)
# ---------------------------------------------------------------------------
$dumpResult = $null

if (-not $SkipDump) {
    Write-Step "Running pg_dump → Spaces …"
    Write-Info "(Requires pg_dump on PATH and DATABASE_URL / DO_SPACES_* env vars)"
    Write-Info "Run with -SkipDump to skip this step."

    try {
        $dumpOutput = node scripts/ops/backup-postgres.mjs --env production 2>&1
        # The last line of stdout is a JSON summary
        $jsonLine = ($dumpOutput | Where-Object { $_ -match '^\{"ok"' } | Select-Object -Last 1)
        if ($jsonLine) {
            $dumpResult = $jsonLine | ConvertFrom-Json
            Write-Ok  "Local   : $($dumpResult.localPath)"
            Write-Ok  "Spaces  : $($dumpResult.spacesKey)"
            Write-Ok  "Size    : $([math]::Round($dumpResult.sizeBytes / 1MB, 2)) MB"
        } else {
            Write-Host "    [warn] pg_dump completed but JSON summary not found in output." -ForegroundColor Yellow
            Write-Host $dumpOutput
        }
    } catch {
        Write-Host "    [warn] pg_dump failed: $_" -ForegroundColor Yellow
        Write-Host "    [warn] Proceeding without dump. Ensure you have a backup before destroying." -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "    [skip] pg_dump skipped (-SkipDump)." -ForegroundColor Yellow
    Write-Host "    [warn] Ensure you have a backup before destroying the cluster!" -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Step 4 — Write mothball-config.json
# ---------------------------------------------------------------------------
Write-Step "Writing mothball config …"

$mothballConfig = @{
    mothballedAt    = (Get-Date -Format "o")
    note            = "Generated by scripts/do/mothball-databases.ps1. Use rebuild-databases.ps1 to recreate."
    postgres        = @{
        clusterId     = $pg.id
        clusterName   = $pg.name
        region        = $pg.region
        size          = $pg.size
        engine        = $pg.engine
        version       = [string]$pg.version
        nodeCount     = $pg.num_nodes
        tags          = @($pg.tags)
        status        = $pg.status
        logicalDbs    = @($pgDbs | ForEach-Object { $_.name })
        appUsers      = @($pgUsers | Where-Object { $_.name -ne 'doadmin' } | ForEach-Object { $_.name })
        firewallRules = @($pgFw | ForEach-Object {
            @{ type = $_.type; value = $_.value; description = $_.description }
        })
        latestBackup  = if ($latestBackup) {
            @{
                createdAt       = $latestBackup.created_at
                sizeGigabytes   = $latestBackup.size_gigabytes
            }
        } else { $null }
    }
    valkey          = $valkeyConfig
    pgDump          = if ($dumpResult) {
        @{
            localPath  = $dumpResult.localPath
            spacesKey  = $dumpResult.spacesKey
            sizeBytes  = $dumpResult.sizeBytes
            timestamp  = $dumpResult.timestamp
        }
    } else { $null }
    reconstructionSteps = @(
        "1. Run: .\scripts\do\rebuild-databases.ps1 -Config $ConfigOutput"
        "2. Set DATABASE_URL in Doppler / DO App Platform secrets to the new cluster URI."
        "3. Set RATE_LIMIT_REDIS_URL and REDIS_QUEUE_URL to the new Valkey URI."
        "4. Run: npm run db:migrate (against port 25060, not 25061)."
        "5. If restoring data: psql -f <localPath>.sql or from Spaces pg_dump."
        "6. Run: node scripts/ops/verify-partition-integrity.mjs"
        "7. Trigger a smoke test: npm run verify:staging"
    )
}

$configDir = Split-Path $ConfigOutput -Parent
if ($configDir -and -not (Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir | Out-Null }
$mothballConfig | ConvertTo-Json -Depth 10 | Set-Content -Path $ConfigOutput -Encoding UTF8

Write-Ok  "Config written: $ConfigOutput"
Write-Info "(This file is gitignored — store it in 1Password or a secure location.)"

# ---------------------------------------------------------------------------
# Step 5 — Summary and optional destroy
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host " MOTHBALL SUMMARY" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " Postgres cluster : $($pg.id)"
Write-Host " Postgres region  : $($pg.region)  size=$($pg.size)  engine=$($pg.engine)$($pg.version)"
if ($valkeyConfig) {
    Write-Host " Valkey  cluster  : $($valkeyConfig.clusterId)"
    Write-Host " Valkey  region   : $($valkeyConfig.region)  size=$($valkeyConfig.size)"
}
if ($latestBackup) {
    Write-Host " Latest DO backup : $($latestBackup.created_at) ($($latestBackup.size_gigabytes) GiB)"
    Write-Host " [!] DO backups expire 7 days after cluster deletion." -ForegroundColor Yellow
}
if ($dumpResult) {
    Write-Host " pg_dump Spaces   : $($dumpResult.spacesKey)" -ForegroundColor Green
    Write-Host " pg_dump size     : $([math]::Round($dumpResult.sizeBytes / 1MB, 2)) MB"
} else {
    Write-Host " pg_dump          : SKIPPED — ensure you have a backup!" -ForegroundColor Red
}
Write-Host " Config saved     : $ConfigOutput"
Write-Host ""

if (-not $Destroy) {
    Write-Host " Clusters are STILL RUNNING (billing continues)." -ForegroundColor Yellow
    Write-Host " To stop billing, re-run with -Destroy after verifying the backup." -ForegroundColor Yellow
    Write-Host ""
    Write-Host " Reconstruct later with:"
    Write-Host "   .\scripts\do\rebuild-databases.ps1 -Config $ConfigOutput" -ForegroundColor White
    Write-Host ""
    exit 0
}

# ---------------------------------------------------------------------------
# Step 6 — Destroy (requires confirmation)
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "====================================================================" -ForegroundColor Red
Write-Host " DESTROY MODE — this is irreversible!" -ForegroundColor Red
Write-Host "====================================================================" -ForegroundColor Red
Write-Host ""

if (-not $dumpResult -and -not $SkipDump) {
    Write-Host " [!] pg_dump was not completed successfully." -ForegroundColor Red
    Write-Host " Refusing to destroy without a verified backup." -ForegroundColor Red
    Write-Host " Fix the dump error, or re-run with -SkipDump if you have another backup." -ForegroundColor Red
    exit 1
}

if ($Force) {
    Write-Host " -Force supplied — skipping interactive confirmation." -ForegroundColor Yellow
} else {
    $confirm = Read-Host " Type 'mothball' to confirm destroying all clusters"
    if ($confirm -ne "mothball") {
        Write-Host " Aborted — clusters untouched." -ForegroundColor Green
        exit 0
    }
}

if ($ValKeyClusterId) {
    Write-Step "Destroying Valkey cluster $ValKeyClusterId …"
    try {
        Invoke-Do "DELETE" "databases/$ValKeyClusterId"
        Write-Ok "Valkey cluster deleted."
    } catch {
        Write-Host "    [warn] Failed to delete Valkey cluster: $_" -ForegroundColor Yellow
    }
}

Write-Step "Destroying Postgres cluster $PostgresClusterId …"
Invoke-Do "DELETE" "databases/$PostgresClusterId"
Write-Ok "Postgres cluster deleted."

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host " Clusters destroyed. Billing will stop on next DO billing cycle." -ForegroundColor Green
Write-Host " Config saved at: $ConfigOutput" -ForegroundColor Green
Write-Host " Rebuild with  : .\scripts\do\rebuild-databases.ps1 -Config $ConfigOutput" -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Green
Write-Host ""
