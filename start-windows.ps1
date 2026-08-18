# ============================================================
#   NetSphere - Windows Launcher (PowerShell + npm)
#   Starts: trace-service on :3003, Next.js on :3000
# ============================================================

param(
  [switch]$KeepOpen
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  NetSphere - Windows Mode (npm)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# --- Check Node.js ---
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Host "ERROR: Node.js is not installed or not in PATH." -ForegroundColor Red
  Write-Host ""
  Write-Host "Please install Node.js 18+ from: https://nodejs.org/" -ForegroundColor Yellow
  Write-Host "Then re-run this script."
  if (-not $KeepOpen) { Read-Host "Press Enter to exit" }
  exit 1
}

$nodeVersion = (& node -v)
Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
Write-Host ""

# --- Create .env.local if missing ---
if (-not (Test-Path ".env.local")) {
  Write-Host "Creating .env.local from .env.local.example..."
  Copy-Item ".env.local.example" ".env.local"
}

# --- Helper to run npm and check errors ---
function Invoke-Npm {
  param([string]$Args, [string]$WorkingDir)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "cmd.exe"
  $psi.Arguments = "/c npm $Args"
  $psi.WorkingDirectory = $WorkingDir
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $stdoutTask = $p.StandardOutput.ReadToEndAsync()
  $stderrTask = $p.StandardError.ReadToEndAsync()
  $p.WaitForExit()
  $stdout = $stdoutTask.Result
  $stderr = $stderrTask.Result
  if ($p.ExitCode -ne 0) {
    Write-Host $stdout -ForegroundColor Gray
    Write-Host $stderr -ForegroundColor Red
    throw "npm $Args failed in $WorkingDir"
  }
}

# --- Install root deps ---
Write-Host "[1/4] Installing root dependencies..." -ForegroundColor Cyan
Invoke-Npm "install --no-audit --no-fund" $ProjectDir

# --- Install trace-service deps ---
Write-Host "[2/4] Installing trace-service dependencies..." -ForegroundColor Cyan
$traceDir = Join-Path $ProjectDir "mini-services\trace-service"
Invoke-Npm "install --no-audit --no-fund" $traceDir
Invoke-Npm "install --save-dev tsx --no-audit --no-fund" $traceDir

# --- Start trace-service in a new window ---
Write-Host "[3/4] Starting trace-service on http://localhost:3003 ..." -ForegroundColor Cyan
$traceCmd = "cd /d `"$traceDir`" && npx tsx index.ts"
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $traceCmd -WindowStyle Normal

Write-Host "      Waiting for trace-service to start..."
Start-Sleep -Seconds 3

# --- Start Next.js in foreground ---
Write-Host "[4/4] Starting Next.js on http://localhost:3000 ..." -ForegroundColor Cyan
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Open http://localhost:3000 in your browser" -ForegroundColor Green
Write-Host "  Close BOTH windows to stop the services." -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""

try {
  Push-Location $ProjectDir
  & npm run dev
}
finally {
  Pop-Location
  Write-Host ""
  Write-Host "Stopping trace-service..." -ForegroundColor Yellow
  Get-Process | Where-Object { $_.MainWindowTitle -like "*NetSphere*" -or $_.MainWindowTitle -like "*trace-service*" } | Stop-Process -Force -ErrorAction SilentlyContinue
  # Also kill any node process still listening on 3003
  $netstat = & netstat -ano | Select-String ":3003\s+.*LISTENING"
  foreach ($line in $netstat) {
    $pidStr = ($line -split '\s+')[-1].Trim()
    if ($pidStr -match '^\d+$') {
      Stop-Process -Id $pidStr -Force -ErrorAction SilentlyContinue
    }
  }
}
