param([string]$Token, [string]$DropletId = "568513243")
$h = @{ Authorization = "Bearer $Token" }

Write-Host "Waiting for droplet to become active..."
$ip = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 10
    $r = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/droplets/$DropletId" -Headers $h
    $status = $r.droplet.status
    $v4 = $r.droplet.networks.v4 | Where-Object { $_.type -eq "public" }
    if ($status -eq "active" -and $v4) {
        $ip = $v4.ip_address
        Write-Host "Active! IP: $ip"
        $ip | Out-File "$env:TEMP\blackglass-ssh\droplet-ip.txt"
        break
    }
    Write-Host "  [$i] status=$status ..."
}
if (-not $ip) { Write-Host "Timed out waiting for droplet" }
