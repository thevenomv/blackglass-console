param([string]$Token)
$h = @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" }
$pubKey = (Get-Content "$env:TEMP\blackglass-ssh\id_ed25519.pub").Trim()
$bodyObj = [ordered]@{ name = "blackglass-collector"; public_key = $pubKey }
$body = $bodyObj | ConvertTo-Json -Compress
try {
    $r = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/account/keys" -Method POST -Headers $h -Body $body
    Write-Host "OK Key ID: $($r.ssh_key.id)"
} catch {
    $err = $_.ErrorDetails.Message | ConvertFrom-Json
    if ($err.message -match "already") {
        $keys = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/account/keys" -Headers $h
        $existing = $keys.ssh_keys | Where-Object { $_.name -eq "blackglass-collector" }
        Write-Host "EXISTS Key ID: $($existing.id)"
    } else {
        Write-Host "ERROR $($err.message)"
    }
}
