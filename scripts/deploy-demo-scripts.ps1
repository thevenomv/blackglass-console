# deploy-demo-scripts.ps1
# Push BLACKGLASS demo scripts to /root/demo/ on the demo VM.
#
# Usage:
#   .\scripts\deploy-demo-scripts.ps1
#   .\scripts\deploy-demo-scripts.ps1 -DemoHost 206.189.114.207 -SshKey ~\.ssh\id_rsa
param(
    [string]$DemoHost = "",
    [string]$SshUser  = "",
    [string]$SshKey   = ""
)

$ErrorActionPreference = "Stop"

if (-not $DemoHost) { $DemoHost = if ($env:DEMO_HOST)     { $env:DEMO_HOST }     else { "167.99.59.55" } }
if (-not $SshUser)  { $SshUser  = if ($env:DEMO_SSH_USER) { $env:DEMO_SSH_USER } else { "root" } }
if (-not $SshKey)   { $SshKey   = if ($env:DEMO_SSH_KEY)  { $env:DEMO_SSH_KEY }  else { "" } }

$scripts = @(
    "scripts/full-demo.sh",
    "scripts/reset-demo-desktop.sh",
    "scripts/restore-demo-desktop.sh",
    "scripts/setup-demo-icons.sh",
    "scripts/check-demo-vm.sh"
)

# reset-demo-desktop.sh is also deployed as reset.sh (the name full-demo.sh references)
# check-demo-vm.sh is also deployed as check.sh for brevity
$aliases = @{
    "scripts/reset-demo-desktop.sh" = "reset.sh"
    "scripts/check-demo-vm.sh"      = "check.sh"
}

$sshArgs = @("-o", "StrictHostKeyChecking=accept-new", "-o", "BatchMode=yes")
if ($SshKey -ne "") { $sshArgs += @("-i", $SshKey) }

$target = "${SshUser}@${DemoHost}"

Write-Host ""
Write-Host "  BLACKGLASS -- Deploy demo scripts" -ForegroundColor Cyan
Write-Host "  Target: $target -> /root/demo/" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/4] Creating /root/demo on $DemoHost ..." -ForegroundColor Yellow
& ssh @sshArgs $target "mkdir -p /root/demo && chmod 700 /root/demo"

Write-Host "[2/4] Uploading scripts ..." -ForegroundColor Yellow
foreach ($s in $scripts) {
    if (-not (Test-Path $s)) {
        Write-Warning "  Skipping '$s' -- file not found locally."
        continue
    }
    $leaf = [System.IO.Path]::GetFileName($s)
    Write-Host "  $s -> /root/demo/$leaf"
    & scp @sshArgs $s "${target}:/root/demo/${leaf}"

    if ($aliases.ContainsKey($s)) {
        $aliasLeaf = $aliases[$s]
        Write-Host "  $s -> /root/demo/$aliasLeaf (alias)"
        & scp @sshArgs $s "${target}:/root/demo/${aliasLeaf}"
    }
}

Write-Host "[3/4] Setting permissions ..." -ForegroundColor Yellow
& ssh @sshArgs $target "chmod +x /root/demo/*.sh"

Write-Host "[4/4] Installing XFCE desktop icons ..." -ForegroundColor Yellow
& ssh @sshArgs $target "bash /root/demo/setup-demo-icons.sh"

Write-Host ""
Write-Host "  Done. Scripts deployed and desktop icons created on $DemoHost." -ForegroundColor Green
Write-Host ""
Write-Host "  In RustDesk you will see two icons on the desktop:" -ForegroundColor Yellow
Write-Host "    - Run BLACKGLASS Demo  -- double-click to start the 8-scene demo"
Write-Host "    - Reset Demo           -- double-click after demo to restore clean state"
Write-Host ""
Write-Host "  Before the first run: capture a clean baseline in BLACKGLASS." -ForegroundColor Yellow
Write-Host ""
