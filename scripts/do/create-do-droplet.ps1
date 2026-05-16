param(
    [Parameter(Mandatory)][string]$Token,
    [string]$Name = "blackglass-lab-01",
    [string]$Region = "lon1",
    [string]$Size = "s-1vcpu-1gb"
)

# Provisions the BLACKGLASS sales-demo VM that the App Platform collector
# scans against during customer demos. Inject your home pubkey + the
# collector pubkey via cloud-init, set up the `blackglass` scan user with
# a tightly-scoped sudoers entry, and lock down sshd.
#
# Defaults match the lon1 App Platform deployment as of 2026-05-07.
# SSH key IDs below are pulled live from the account so the script keeps
# working when keys are rotated. Re-key by replacing the local files in
# $env:TEMP\blackglass-ssh\.

$ErrorActionPreference = "Stop"
$h = @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" }

$collectorPubPath = "$env:TEMP\blackglass-ssh\id_collector.pub"
$personalPubPath  = "$env:TEMP\blackglass-ssh\id_ed25519.pub"
foreach ($p in @($collectorPubPath, $personalPubPath)) {
    if (-not (Test-Path $p)) { throw "Missing pubkey at $p" }
}
$collectorPub = (Get-Content $collectorPubPath -Raw).Trim()
$personalPub  = (Get-Content $personalPubPath  -Raw).Trim()

# Pull all account ssh keys so the Droplet boots with both your laptop key
# and the collector key in /root/.ssh/authorized_keys (cloud-init below
# also re-asserts these explicitly so we're robust to key rotation).
$keys = (Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/account/keys" -Headers $h).ssh_keys
$keyIds = @($keys | ForEach-Object { $_.id })
Write-Host "Using SSH key IDs: $($keyIds -join ', ')"

$cloudInit = @"
#!/bin/bash
set -euo pipefail
exec > >(tee -a /var/log/blackglass-init.log) 2>&1
echo "[$Name] cloud-init starting at `$(date -Is)"

mkdir -p /root/.ssh && chmod 700 /root/.ssh
echo '$personalPub'  >> /root/.ssh/authorized_keys
echo '$collectorPub' >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

useradd -m -s /bin/bash blackglass
mkdir -p /home/blackglass/.ssh
echo '$collectorPub' >> /home/blackglass/.ssh/authorized_keys
chown -R blackglass:blackglass /home/blackglass/.ssh
chmod 700 /home/blackglass/.ssh
chmod 600 /home/blackglass/.ssh/authorized_keys

# Read-only audit commands the scan engine needs.
cat > /etc/sudoers.d/blackglass-scan <<'SUDOEOF'
blackglass ALL=(ALL) NOPASSWD: /usr/bin/id, /usr/bin/ss, /usr/bin/find, /usr/bin/cat, /usr/bin/getent, /usr/sbin/sshd, /usr/bin/stat, /usr/bin/awk, /usr/bin/grep, /usr/bin/cut, /usr/bin/head, /usr/bin/tail, /bin/ls, /usr/bin/wc, /usr/bin/test, /bin/systemctl
SUDOEOF
chmod 440 /etc/sudoers.d/blackglass-scan

# Defense-in-depth: ufw permits SSH only (key auth handles brute-force).
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH (key-only)'
ufw --force enable

sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?UseDNS.*/UseDNS no/' /etc/ssh/sshd_config
grep -q '^UseDNS ' /etc/ssh/sshd_config || echo 'UseDNS no' >> /etc/ssh/sshd_config
systemctl reload ssh

echo "[$Name] cloud-init done at `$(date -Is)"
"@

$body = @{
    name      = $Name
    region    = $Region
    size      = $Size
    image     = "ubuntu-22-04-x64"
    ssh_keys  = $keyIds
    tags      = @("blackglass", "collector-target", "sales-demo")
    user_data = $cloudInit
} | ConvertTo-Json -Depth 5

Write-Host "Creating Droplet $Name in $Region..."
$r = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/droplets" -Method POST -Headers $h -Body $body
Write-Host "Droplet ID: $($r.droplet.id)  Status: $($r.droplet.status)"

if (-not (Test-Path "$env:TEMP\blackglass-ssh")) {
    New-Item -ItemType Directory -Path "$env:TEMP\blackglass-ssh" -Force | Out-Null
}
$r.droplet.id | Out-File "$env:TEMP\blackglass-ssh\droplet-id.txt"

Write-Host "Waiting for active state + public IPv4..."
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 8
    $d = (Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/droplets/$($r.droplet.id)" -Headers $h).droplet
    $ip = $d.networks.v4 | Where-Object { $_.type -eq "public" } | Select-Object -ExpandProperty ip_address -First 1
    Write-Host "  status=$($d.status) ip=$ip"
    if ($d.status -eq "active" -and $ip) {
        $ip | Out-File "$env:TEMP\blackglass-ssh\droplet-ip.txt"
        Write-Host ""
        Write-Host "READY: ssh -i `$env:TEMP\blackglass-ssh\id_collector root@$ip"
        Write-Host "Update App Platform: COLLECTOR_HOST_1=$ip COLLECTOR_HOST_1_NAME=$Name"
        return
    }
}
Write-Host "Timed out waiting for active state — check DO console for $($r.droplet.id)"
