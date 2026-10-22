param([switch]$Bedrock, [switch]$SkipVega, [string]$Distro = "Ubuntu-22.04")
$ErrorActionPreference = "Stop"
$Repo = Resolve-Path (Join-Path $PSScriptRoot "..\..")
function Say($text) { Write-Host "`n$text" -ForegroundColor Yellow }

if (-not $SkipVega) {
  Say "Checking WSL2 and $Distro"
  $distros = (wsl --list --quiet 2>$null) -replace "`0", "" | Where-Object { $_ }
  if ($distros -notcontains $Distro) {
    Write-Host "Installing $Distro in WSL2. Windows may ask for admin rights and a restart; run this script again afterwards."
    wsl --install -d $Distro
    exit 1
  }
  $cfg = Join-Path $env:USERPROFILE ".wslconfig"
  $want = "[wsl2]`nnestedVirtualization=true`nnetworkingMode=mirrored`nmemory=12GB`n"
  $current = if (Test-Path $cfg) { Get-Content $cfg -Raw } else { "" }
  if ($current -notmatch "nestedVirtualization\s*=\s*true" -or $current -notmatch "networkingMode\s*=\s*mirrored") {
    if ($current) { Copy-Item $cfg "$cfg.bak-lumina" }
    Set-Content -Path $cfg -Value $want -Encoding ascii
    Write-Host "Wrote $cfg (nested virtualization, mirrored networking). Restarting WSL."
    wsl --shutdown
  }
}

Say "Starting Lumina in Docker"
docker info *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "Docker Desktop isn't running. Start it, then run this script again."; exit 1 }
if ($Bedrock) {
  aws configure export-credentials --format powershell | Out-String | Invoke-Expression
  $env:LLM = "bedrock"
} else {
  $env:LLM = "offline"
}
$env:HOME = $env:USERPROFILE
Push-Location $Repo
docker compose up -d --build
Pop-Location
for ($i = 0; $i -lt 90; $i++) {
  try { Invoke-RestMethod http://localhost:8787/api/health | Out-Null; break } catch { Start-Sleep 2 }
}
Write-Host "Lumina Studio: http://localhost:8787 (AI: $env:LLM)"
Start-Process "http://localhost:8787"

if (-not $SkipVega) {
  Say "Starting the Vega Virtual Device in $Distro (first run installs the Vega SDK: 20-40 minutes)"
  $linuxRepo = (wsl -d $Distro wslpath -a ($Repo.Path -replace "\\", "/")).Trim()
  wsl -d $Distro -- bash -lc "bash '$linuxRepo/scripts/windows/vega-ubuntu.sh'"
}
