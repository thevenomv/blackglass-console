param([string]$Token)
$h = @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" }

# Minimal Ubuntu 22.04 Droplet — same region as the App Platform app (NYC3)
$body = @{
    name     = "blackglass-lab-01"
    region   = "nyc3"
    size     = "s-1vcpu-1gb"
    image    = "ubuntu-22-04-x64"
    ssh_keys = @(56040647)
    tags     = @("blackglass", "collector-target")
} | ConvertTo-Json -Compress

$r = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/droplets" -Method POST -Headers $h -Body $body
Write-Host "Droplet ID: $($r.droplet.id)  Status: $($r.droplet.status)"
$r.droplet.id | Out-File "$env:TEMP\blackglass-ssh\droplet-id.txt"
