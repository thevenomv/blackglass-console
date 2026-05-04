#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Point the RustDesk *installed* Windows client at your self-hosted hbbs (ID server + public key).

.DESCRIPTION
  Uses the same non-interactive form as upstream examples:
  rustdesk.exe --config "host=IP,key=PUBLIC_KEY"

  Install RustDesk first, then run this script elevated (Run as Administrator).

.NOTES
  Defaults target the project RustDesk ID server; override with $env:RD_ID_SERVER and $env:RD_PUBLIC_KEY.
  See docs/rustdesk-demo-setup.md for ports (21114), relay 21117, and split-server layout.
#>

$ErrorActionPreference = 'Stop'

$RdIdServer = if ($env:RD_ID_SERVER) { $env:RD_ID_SERVER } else { '206.189.114.207' }
$RdPublicKey = if ($env:RD_PUBLIC_KEY) { $env:RD_PUBLIC_KEY } else {
  '8FFJuTNp6R4mA3QgCGh2JB4wEoZ9uSnaBWcj85vipQ4='
}

$exe = Join-Path ${env:ProgramFiles} 'RustDesk\rustdesk.exe'
if (-not (Test-Path -LiteralPath $exe)) {
  Write-Host "RustDesk not found at $exe — install RustDesk x64 first."
  exit 1
}

$cfg = "host=$RdIdServer,key=$RdPublicKey"
Write-Host "Applying: $exe --config `"$cfg`""
& $exe --config $cfg

Write-Host "Done. Open RustDesk and confirm Settings -> Network, or note your ID from the main window."
