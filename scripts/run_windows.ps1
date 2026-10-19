$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
  throw 'Python Launcher (py) was not found. Install Python 3.11+ from https://www.python.org/downloads/windows/'
}

$pythonVersion = & py -3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ($LASTEXITCODE -ne 0) {
  throw 'No Python 3 installation was found. Install Python 3.11 or newer, then reopen PowerShell.'
}
$versionParts = $pythonVersion.Trim().Split('.')
if ([int]$versionParts[0] -lt 3 -or ([int]$versionParts[0] -eq 3 -and [int]$versionParts[1] -lt 11)) {
  throw "Python 3.11+ is required. The selected Python version is $pythonVersion."
}

if (-not (Test-Path '.venv')) {
  & py -3 -m venv .venv
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the virtual environment.' }
}

& .\.venv\Scripts\python.exe -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Could not upgrade pip.' }
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Could not install project requirements.' }

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -or -not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
  Write-Host 'FFmpeg/FFprobe is not on PATH. Facebook connection can be configured, but video splitting will fail until FFmpeg is installed.' -ForegroundColor Yellow
  Write-Host 'Install it with: winget install --id Gyan.FFmpeg' -ForegroundColor Yellow
  Write-Host 'After installation, open a new PowerShell window and run this script again.' -ForegroundColor Yellow
  Write-Host ''
}

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host ''
  Write-Host 'One-time Facebook setup: .env has been created.' -ForegroundColor Yellow
  Write-Host 'Fill in FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in Notepad, save, and close Notepad.' -ForegroundColor Yellow
  Write-Host 'The in-app setup guide is at http://localhost:8000/setup after the server starts.' -ForegroundColor Yellow
  Start-Process -FilePath 'notepad.exe' -ArgumentList (Join-Path (Get-Location) '.env') -Wait
}

Write-Host ''
Write-Host 'Starting Partly at http://localhost:8000' -ForegroundColor Green
Write-Host 'Keep this PowerShell window open while you use the app.' -ForegroundColor Gray
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
