#requires -version 5.1
<#
  Copies .do/app.yaml to .do/app.local.yaml with your registry name substituted.

  Usage:
    .\scripts\do-prepare-app-spec.ps1 -RegistryName "my-registry"
    doctl apps create --spec .do/app.local.yaml
#>
param(
  [Parameter(Mandatory = $true)][string]$RegistryName
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root ".do\app.yaml"
$dst = Join-Path $root ".do\app.local.yaml"

(Get-Content $src -Raw) -replace "REGISTRY_NAME_PLACEHOLDER", $RegistryName | Set-Content $dst -NoNewline:$false
Write-Host "Wrote $dst"
Write-Host "Next: doctl apps create --spec .do/app.local.yaml"
