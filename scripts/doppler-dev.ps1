# Single entrypoint: refreshes PATH, checks CLI + repo scope, starts Next via `doppler run`.
# Add `SSH_PRIVATE_KEY` in Doppler (dev config); repo root has doppler.yaml → blackglass/dev.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$env:Path =
  [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
  [System.Environment]::GetEnvironmentVariable("Path", "User")

$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

if (-not (Get-Command doppler -ErrorAction SilentlyContinue)) {
  Write-Error "Doppler CLI not found. Install: https://docs.doppler.com/docs/install-cli then restart the terminal."
  exit 1
}

$proj = doppler configure get project --plain 2>$null
$cfg = doppler configure get config --plain 2>$null
if (-not $proj -or -not $cfg) {
  Write-Host "No project/config scoped to this folder. Run:" -ForegroundColor Yellow
  Write-Host "  doppler setup --project blackglass --config dev --no-interactive" -ForegroundColor Cyan
  exit 1
}

Write-Host "Doppler: $proj / $cfg" -ForegroundColor DarkGray
npm run dev:doppler
