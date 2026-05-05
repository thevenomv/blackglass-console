#requires -version 5.1
<#
  Build BLACKGLASS Docker image(s) and push to GitHub Container Registry (GHCR).

  Prerequisites:
  - Docker Desktop (or Engine) on PATH
  - GHCR_TOKEN: GitHub PAT with write:packages scope (do not commit tokens)
  - GITHUB_ACTOR: your GitHub username or org

  Usage:
    $env:GHCR_TOKEN  = "<github-pat>"
    $env:GITHUB_ACTOR = "<your-github-username>"
    $env:BLACKGLASS_PUBLIC_URL = "https://your-app.ondigitalocean.app"
    .\scripts\do-docker-push.ps1

    # Also build and push the scan worker image:
    .\scripts\do-docker-push.ps1 -BuildWorker
#>
param(
  [string]$GhcrToken   = $env:GHCR_TOKEN,
  [string]$GithubActor = $env:GITHUB_ACTOR,
  [string]$Tag         = "latest",
  [string]$PublicAppUrl = $(if ($env:BLACKGLASS_PUBLIC_URL) { $env:BLACKGLASS_PUBLIC_URL } else { "http://127.0.0.1:3000" }),
  [switch]$BuildWorker
)

$ErrorActionPreference = "Stop"

if (-not $GhcrToken)   { throw "Set GHCR_TOKEN to a GitHub PAT with write:packages scope." }
if (-not $GithubActor) { throw "Set GITHUB_ACTOR to your GitHub username or org." }

$registryHost = "ghcr.io"
$webImage     = "$registryHost/$GithubActor/blackglass-console:$Tag"
$workerImage  = "$registryHost/$GithubActor/blackglass-worker:$Tag"
$repoRoot     = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host "Logging in to $registryHost ..."
$GhcrToken | docker login $registryHost -u $GithubActor --password-stdin

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
  Write-Host "Worker pushed."
}

Write-Host ""
Write-Host "Done. Update GITHUB_ORG placeholders in .do/app.yaml to '$GithubActor', then:"
Write-Host "  doctl apps create --spec .do/app.yaml"
Write-Host "  # or: doctl apps update <app-id> --spec .do/app.yaml"