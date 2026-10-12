<#
  Arknight Card Battle - self host launcher
  -----------------------------------------
  Menjalankan server game di PC ini, lalu membuka tunnel gratis dari Cloudflare
  (Quick Tunnel, tanpa akun) supaya teman di internet bisa ikut main.

  Pakai:  klik dua kali HOST.bat   (atau: powershell -File tools\host.ps1)
  Stop :  tutup jendela / tekan Ctrl+C
#>
[CmdletBinding()]
param(
  [int]$Port = 8130
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$toolsDir = $PSScriptRoot
$root     = Split-Path -Parent $toolsDir
$cf       = Join-Path $toolsDir 'cloudflared.exe'

Write-Host ""
Write-Host "  === Arknight Card Battle - SELF HOST ===" -ForegroundColor Cyan
Write-Host ""

# --- 1. cloudflared (unduh sekali di pemakaian pertama) ---------------------
if (-not (Test-Path $cf)) {
  Write-Host "  Mengunduh cloudflared (~40MB, hanya sekali)..." -ForegroundColor Yellow
  $dl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
  Invoke-WebRequest -Uri $dl -OutFile $cf -UseBasicParsing
  Write-Host "  Selesai." -ForegroundColor Green
}

# --- 2. server game ---------------------------------------------------------
function Test-Port([int]$p) {
  try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $p); $c.Close(); return $true }
  catch { return $false }
}

$node = $null
if (Test-Port $Port) {
  Write-Host "  Port $Port sudah jalan - pakai server yang ada." -ForegroundColor Gray
} else {
  Write-Host "  Menjalankan server game di http://localhost:$Port ..."
  $node = Start-Process node -ArgumentList 'server.js', "$Port" -WorkingDirectory $root -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 1
}

# --- 3. tunnel publik -------------------------------------------------------
$log = Join-Path $env:TEMP ('acb-tunnel-' + [guid]::NewGuid().ToString('N') + '.log')
$tunnel = Start-Process $cf -ArgumentList @('tunnel', '--url', "http://localhost:$Port", '--no-autoupdate') `
  -PassThru -WindowStyle Hidden -RedirectStandardError $log

Write-Host "  Membuka tunnel publik..." -ForegroundColor Yellow
$public = $null
for ($i = 0; $i -lt 80; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Path $log) {
    $txt = Get-Content $log -Raw -ErrorAction SilentlyContinue
    if ($txt -and $txt -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $public = $matches[0]; break }
  }
  if ($tunnel.HasExited) { break }
}

$lan = $null
try {
  $lan = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -First 1 -ExpandProperty IPAddress)
} catch {}

Write-Host ""
Write-Host "  ================ CARA MAIN ================" -ForegroundColor Green
if ($lan)    { Write-Host ("   Satu Wi-Fi (LAN) : http://{0}:{1}" -f $lan, $Port) }
if ($public) {
  Write-Host ("   Internet         : {0}" -f $public) -ForegroundColor Yellow
  Write-Host  "   -> Kirim link 'Internet' ini ke temanmu." -ForegroundColor Gray
} else {
  Write-Host  "   Tunnel gagal dibuat. Log terakhir:" -ForegroundColor Red
  if (Test-Path $log) { Get-Content $log -Tail 15 }
}
Write-Host "  ===========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Buka salah satu link di atas -> menu Online -> Buat Room / Gabung."
Write-Host "  Biarkan jendela ini tetap terbuka. Tekan Ctrl+C untuk berhenti."
Write-Host ""

try {
  Wait-Process -Id $tunnel.Id
} finally {
  Write-Host "  Menghentikan..." -ForegroundColor Yellow
  Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue
  if ($node) { Stop-Process -Id $node.Id -Force -ErrorAction SilentlyContinue }
  if (Test-Path $log) { Remove-Item $log -Force -ErrorAction SilentlyContinue }
}
