# Full project setup for local development (no Docker required)
$root = "$PSScriptRoot\.."

Write-Host "=== Audio Stem Platform – Setup ===" -ForegroundColor Magenta

# Backend
Write-Host "`n[1/3] Setting up Python backend..." -ForegroundColor Cyan
Set-Location "$root\backend"
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt

# Create .env from example
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "  Created backend/.env from .env.example" -ForegroundColor Yellow
}

# Frontend
Write-Host "`n[2/3] Installing frontend dependencies..." -ForegroundColor Cyan
Set-Location "$root\frontend"
npm install

# Storage directory
Write-Host "`n[3/3] Creating storage directories..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "$root\backend\storage\uploads" | Out-Null
New-Item -ItemType Directory -Force -Path "$root\backend\storage\stems"   | Out-Null

Write-Host "`n=== Setup complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "To start the app open TWO terminals:" -ForegroundColor White
Write-Host "  Terminal 1 (backend):  .\scripts\start-backend.ps1" -ForegroundColor Yellow
Write-Host "  Terminal 2 (frontend): .\scripts\start-frontend.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host "Then open http://localhost:5173 in your browser." -ForegroundColor Green
