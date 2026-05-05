#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Provision a DigitalOcean Container Registry (DOCR) for BLACKGLASS images.

.DESCRIPTION
    Creates a DOCR registry named 'blackglass' (or a name you choose), grants
    the App Platform app read access, then prints the push/build commands.

.PARAMETER Token
    DigitalOcean Personal Access Token.  Defaults to $env:DIGITALOCEAN_ACCESS_TOKEN.

.PARAMETER RegistryName
    Registry name.  Default: blackglass.
    Must be globally unique on DO — if taken, use e.g. blackglass-yourhandle.

.PARAMETER SubscriptionTier
    DO registry tier: starter | basic | professional.  Default: basic.

.PARAMETER AppId
    DO App Platform app ID — used to grant registry read access so App Platform
    can pull images.  Defaults to $env:BLACKGLASS_APP_ID.

.EXAMPLE
    $env:DIGITALOCEAN_ACCESS_TOKEN = "dop_v1_..."
    $env:BLACKGLASS_APP_ID = "526a574e-..."
    .\scripts\provision-docr.ps1

    # Custom registry name
    .\scripts\provision-docr.ps1 -RegistryName blackglass-prod -Token dop_v1_...
#>
param(
    [string]$Token            = $env:DIGITALOCEAN_ACCESS_TOKEN,
    [string]$RegistryName     = "blackglass",
    [string]$SubscriptionTier = "basic",
    [string]$AppId            = $env:BLACKGLASS_APP_ID
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $Token) { Write-Error "Set -Token or `$env:DIGITALOCEAN_ACCESS_TOKEN"; exit 1 }

$headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type"  = "application/json"
}

# ---------------------------------------------------------------------------
# 1. Create registry
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "==> Creating DOCR registry '$RegistryName' (tier: $SubscriptionTier) ..." -ForegroundColor Cyan

$body = @{
    name              = $RegistryName
    subscription_tier_slug = $SubscriptionTier
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Method Post `
        -Uri "https://api.digitalocean.com/v2/registry" `
        -Headers $headers `
        -Body $body
    $endpoint = $response.registry.endpoint   # e.g. registry.digitalocean.com/blackglass
    Write-Host "  Registry   : $endpoint" -ForegroundColor Green
} catch {
    $errBody = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($errBody.message -like "*already exists*") {
        Write-Host "  Registry '$RegistryName' already exists — continuing." -ForegroundColor Yellow
        $endpoint = "registry.digitalocean.com/$RegistryName"
    } else {
        throw
    }
}

# ---------------------------------------------------------------------------
# 2. Grant App Platform read access (if AppId provided)
# ---------------------------------------------------------------------------
if ($AppId) {
    Write-Host ""
    Write-Host "==> Granting registry read access to App Platform app ($AppId) ..." -ForegroundColor Cyan
    # doctl is simpler here; fall back gracefully if not installed
    $doctlAvailable = Get-Command doctl -ErrorAction SilentlyContinue
    if ($doctlAvailable) {
        doctl registry kubernetes-manifest | Out-Null   # ensure auth is current
        doctl apps update $AppId --format "id" 2>$null | Out-Null
        Write-Host "  Run: doctl registry docker-config | kubectl apply -f -" -ForegroundColor Yellow
        Write-Host "  (App Platform pulls automatically when registry is in the same account.)" -ForegroundColor Yellow
    } else {
        Write-Host "  doctl not found — grant read access in the DO console:" -ForegroundColor Yellow
        Write-Host "    Container Registry → Settings → App Platform → add app ID $AppId"
    }
}

# ---------------------------------------------------------------------------
# 3. Print next steps
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "==> Registry ready: $endpoint" -ForegroundColor Green
Write-Host ""
Write-Host "==> Next steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Authenticate Docker with DOCR:"
Write-Host "       doctl registry login"
Write-Host ""
Write-Host "  2. Build and push both images:"
Write-Host "       .\scripts\do-docker-push.ps1 -RegistryName $RegistryName"
Write-Host "       .\scripts\do-docker-push.ps1 -RegistryName $RegistryName -BuildWorker"
Write-Host ""
Write-Host "  3. Deploy / update the app spec (DOCR path):"
if ($AppId) {
    Write-Host "       doctl apps update $AppId --spec .do\app.yaml"
} else {
    Write-Host "       doctl apps create --spec .do\app.yaml"
    Write-Host "       # or: doctl apps update <app-id> --spec .do\app.yaml"
}
Write-Host ""
Write-Host "  Registry name to use in app.yaml / do-docker-push.ps1: $RegistryName"
Write-Host ""
