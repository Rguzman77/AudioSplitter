# Start the FastAPI backend
Set-Location "$PSScriptRoot\..\backend"

if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Cyan
    python -m venv venv
    .\venv\Scripts\Activate.ps1
    pip install -r requirements.txt
} else {
    .\venv\Scripts\Activate.ps1
}

Write-Host "Starting backend on http://localhost:8000" -ForegroundColor Green
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
