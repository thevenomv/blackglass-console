#requires -version 5.1
<#
  Build BLACKGLASS Docker image(s) and push to DigitalOcean Container Registry.

  Prerequisites:
  - Docker Desktop (or Engine) on PATH
  - DIGITALOCEAN_ACCESS_TOKEN in environment (do not commit tokens)

  Usage:
    $env:DIGITALOCEAN_ACCESS_TOKEN = "<token>"
    $env:BLACKGLASS_PUBLIC_URL = "https://your-app.ondigitalocean.app"
    .\scripts\do-docker-push.ps1 -RegistryName "my-registry"

    # Also build and push the scan worker image (Dockerfile.worker):
    .\scripts\do-docker-push.ps1 -RegistryName "my-registry" -BuildWorker

  First deploy: use a placeholder URL, deploy app, then rebuild with the real default route URL.
#>
param(
  [Parameter(Mandatory = $true)][string]$RegistryName,
  [string]$Tag = "latest",
  [string]$PublicAppUrl = $(if ($env:BLACKGLASS_PUBLIC_URL) { $env:BLACKGLASS_PUBLIC_URL } else { "http://127.0.0.1:3000" }),
  [switch]$BuildWorker
)

$ErrorActionPreference = "Stop"

if (-not $env:DIGITALOCEAN_ACCESS_TOKEN) {
  throw "Set DIGITALOCEAN_ACCESS_TOKEN to a DigitalOcean personal access token."
}

$registryHost = "registry.digitalocean.com"
$webImage    = "$registryHost/$RegistryName/blackglass-console:$Tag"
$workerImage = "$registryHost/$RegistryName/blackglass-worker:$Tag"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host "Logging in to $registryHost ..."
$token = $env:DIGITALOCEAN_ACCESS_TOKEN
if (Get-Command doctl -ErrorAction SilentlyContinue) {
  doctl registry login --expiry-seconds 1200
}
else {
  echo $token | docker login $registryHost -u $token --password-stdin
}

# --- Web image ---
Write-Host "Building $webImage (NEXT_PUBLIC_APP_URL=$PublicAppUrl) ..."
docker build `
  --build-arg "NEXT_PUBLIC_APP_URL=$PublicAppUrl" `
  --build-arg "NEXT_PUBLIC_USE_MOCK=false" `
  -t $webImage `
  $repoRoot

Write-Host "Pushing $webImage ..."
docker push $webImage

# --- Worker image (opt-in) ---
if ($BuildWorker) {
  Write-Host "Building $workerImage (Dockerfile.worker) ..."
  docker build `
    -f "$repoRoot\Dockerfile.worker" `
    -t $workerImage `
    $repoRoot

  Write-Host "Pushing $workerImage ..."
  docker push $workerImage
  Write-Host "Worker image pushed. Ensure .do/app.yaml workers[].image.registry matches '$RegistryName'."
}

Write-Host ""
Write-Host "Done. Update registry/repository in .do/app.yaml if needed, then:"
Write-Host "  doctl apps create --spec .do/app.yaml"
Write-Host "  # or: doctl apps update <app-id> --spec .do/app.yaml"
