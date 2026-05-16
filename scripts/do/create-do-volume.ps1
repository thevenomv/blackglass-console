param([string]$Token)
$h = @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" }

# 1 GiB volume in NYC3 — DO App Platform volumes must be same region as app
$body = @{
    size_gigabytes = 1
    name           = "blackglass-baselines"
    region         = "nyc3"
    description    = "Persistent baseline and drift history for BLACKGLASS console"
} | ConvertTo-Json -Compress

$r = Invoke-RestMethod -Uri "https://api.digitalocean.com/v2/volumes" -Method POST -Headers $h -Body $body
Write-Host "Volume ID: $($r.volume.id)  Name: $($r.volume.name)"
$r.volume.id | Out-File "$env:TEMP\blackglass-ssh\volume-id.txt"
