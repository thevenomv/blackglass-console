# Single entrypoint: refreshes PATH, checks CLI + repo scope, starts Next via `doppler run`.
# Add `SSH_PRIVATE_KEY` in Doppler (dev config); repo root has doppler.yaml → blackglass/dev.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$env:Path =
  [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
  [System.Environment]::GetEnvironmentVariable("Path", "User")

$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

# Allow token auth without interactive login: read DOPPLER_TOKEN from gitignored .env.local
$envLocal = Join-Path $repoRoot ".env.local"
if (Test-Path $envLocal) {
  Get-Content $envLocal | ForEach-Object {
    $line = $_.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $k = $line.Substring(0, $eq).Trim()
    $v = $line.Substring($eq + 1).Trim()
    if ($k -eq "DOPPLER_TOKEN" -and $v.Length -gt 0) {
      $env:DOPPLER_TOKEN = $v
    }
  }
}

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
