#requires -version 5.1
<#
  Build BLACKGLASS Docker image and push to DigitalOcean Container Registry.

  Prerequisites:
  - Docker Desktop (or Engine) on PATH
  - DIGITALOCEAN_ACCESS_TOKEN in environment (do not commit tokens)

  Usage:
    $env:DIGITALOCEAN_ACCESS_TOKEN = "<token>"
    $env:BLACKGLASS_PUBLIC_URL = "https://your-app.ondigitalocean.app"
    .\scripts\do-docker-push.ps1 -RegistryName "my-registry"

  First deploy: use a placeholder URL, deploy app, then rebuild with the real default route URL.
#>
param(
  [Parameter(Mandatory = $true)][string]$RegistryName,
  [string]$Tag = "latest",
  [string]$PublicAppUrl = $(if ($env:BLACKGLASS_PUBLIC_URL) { $env:BLACKGLASS_PUBLIC_URL } else { "http://127.0.0.1:3000" })
)

$ErrorActionPreference = "Stop"

if (-not $env:DIGITALOCEAN_ACCESS_TOKEN) {
  throw "Set DIGITALOCEAN_ACCESS_TOKEN to a DigitalOcean personal access token."
}

$registryHost = "registry.digitalocean.com"
$image = "$registryHost/$RegistryName/blackglass-console:$Tag"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host "Logging in to $registryHost ..."
$token = $env:DIGITALOCEAN_ACCESS_TOKEN
if (Get-Command doctl -ErrorAction SilentlyContinue) {
  doctl registry login --expiry-seconds 1200
}
else {
  echo $token | docker login $registryHost -u $token --password-stdin
}

Write-Host "Building $image (NEXT_PUBLIC_APP_URL=$PublicAppUrl) ..."
docker build `
  --build-arg "NEXT_PUBLIC_APP_URL=$PublicAppUrl" `
  --build-arg "NEXT_PUBLIC_USE_MOCK=false" `
  -t $image `
  $repoRoot

Write-Host "Pushing $image ..."
docker push $image

Write-Host "Done. Update registry/repository in .do/app.yaml if needed, then:"
Write-Host "  doctl apps create --spec .do/app.yaml"
