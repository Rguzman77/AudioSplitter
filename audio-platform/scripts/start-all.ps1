# Start backend and frontend in separate PowerShell windows
$scriptsDir = $PSScriptRoot

Write-Host "Starting backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-File", "$scriptsDir\start-backend.ps1"

Write-Host "Starting frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-File", "$scriptsDir\start-frontend.ps1"

Write-Host ""
Write-Host "Services starting:" -ForegroundColor Green
Write-Host "  Backend  -> http://localhost:8000" -ForegroundColor Yellow
Write-Host "  Frontend -> http://localhost:5173" -ForegroundColor Yellow
Write-Host ""
Write-Host "Run stop-all.ps1 to shut them down." -ForegroundColor Gray
