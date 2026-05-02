param(
    [Parameter(Mandatory)][string]$Token,
    [Parameter(Mandatory)][string]$AppId,
    [Parameter(Mandatory)][string]$HostIp,
    [string]$PrivateKeyPath = "$env:TEMP\blackglass-ssh\id_collector",
    [string]$HostName = "blackglass-lab-01",
    [string]$CollectorUser = "blackglass",
    [string]$BaselinePath = "/data/blackglass/baselines.json",
    [string]$DriftPath = "/data/blackglass/drift-history.json"
)

$h = @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" }
$privateKey = (Get-Content $PrivateKeyPath -Raw).Trim()

Write-Host "Fetching current app spec..."
$app = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/apps/$AppId" -Headers $h
$spec = $app.app.spec

# ── 1. Clean up top-level envs (service-level takes precedence; remove any I added)
$topLevelToRemove = @("COLLECTOR_HOST_1","COLLECTOR_HOST_1_NAME","COLLECTOR_USER",
    "BASELINE_STORE_PATH","DRIFT_HISTORY_PATH","NEXT_PUBLIC_APP_URL","NEXT_PUBLIC_USE_MOCK")
$spec.envs = if ($spec.envs) {
    $spec.envs | Where-Object { $_.key -notin $topLevelToRemove }
} else { @() }

# ── 2. Update SERVICE-level envs
$svc = $spec.services[0]
$keysToReplace = @("SSH_PRIVATE_KEY","COLLECTOR_HOST_1","COLLECTOR_HOST_1_NAME",
    "COLLECTOR_USER","COLLECTOR_PORT","BASELINE_STORE_PATH","DRIFT_HISTORY_PATH",
    "NEXT_PUBLIC_APP_URL","NEXT_PUBLIC_USE_MOCK")
$svcEnvs = $svc.envs | Where-Object { $_.key -notin $keysToReplace }

$newSvcEnvs = @(
    @{ key = "SSH_PRIVATE_KEY";       value = $privateKey; scope = "RUN_AND_BUILD_TIME"; type = "SECRET" }
    @{ key = "COLLECTOR_HOST_1";      value = $HostIp;     scope = "RUN_AND_BUILD_TIME" }
    @{ key = "COLLECTOR_HOST_1_NAME"; value = $HostName;   scope = "RUN_AND_BUILD_TIME" }
    @{ key = "COLLECTOR_USER";        value = $CollectorUser; scope = "RUN_AND_BUILD_TIME" }
    @{ key = "BASELINE_STORE_PATH";   value = $BaselinePath; scope = "RUN_TIME" }
    @{ key = "DRIFT_HISTORY_PATH";    value = $DriftPath;  scope = "RUN_TIME" }
    @{ key = "NEXT_PUBLIC_APP_URL";   value = "https://blackglass-j9imo.ondigitalocean.app"; scope = "RUN_AND_BUILD_TIME" }
    @{ key = "NEXT_PUBLIC_USE_MOCK";  value = "false"; scope = "RUN_AND_BUILD_TIME" }
)
$svc.envs = @($svcEnvs) + $newSvcEnvs

$spec.services[0] = $svc

Write-Host "Updating app spec (service envs + volume)..."
$body = @{ spec = $spec } | ConvertTo-Json -Depth 20 -Compress
$result = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/apps/$AppId" -Method PUT -Headers $h -Body $body
Write-Host "Done. Phase: $($result.app.phase)  Updated: $($result.app.updated_at)"
Write-Host ""
Write-Host "  COLLECTOR_HOST_1     = $HostIp"
Write-Host "  COLLECTOR_HOST_1_NAME = $HostName"
Write-Host "  COLLECTOR_USER       = $CollectorUser"
Write-Host "  BASELINE_STORE_PATH  = $BaselinePath"
Write-Host "  SSH_PRIVATE_KEY      = [updated to new key]"
