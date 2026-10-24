# OpenSCAD AI Studio Launcher
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Starting OpenSCAD AI Studio" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

$backendVenv = Join-Path $PSScriptRoot "backend\.venv\Scripts\python.exe"
$frontendDir = Join-Path $PSScriptRoot "frontend"

# Start FastAPI Backend in background
Write-Host "Starting FastAPI Backend on http://127.0.0.1:8000..." -ForegroundColor Yellow
$backendJob = Start-Job -ScriptBlock {
    param($py, $root)
    Set-Location $root
    $env:PYTHONPATH = "backend"
    & $py -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
} -ArgumentList $backendVenv, $PSScriptRoot

Start-Sleep -Seconds 2

# Start Frontend Dev Server
Write-Host "Starting Vite Frontend on http://localhost:5173..." -ForegroundColor Green
Set-Location $frontendDir
npm.cmd run dev
