# Stop backend (port 8000) and frontend (port 5173)

function Stop-Port {
    param([int]$Port, [string]$Name)
    $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($conn) {
        $pid = $conn.OwningProcess | Select-Object -First 1
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped $Name (port $Port, PID $pid)" -ForegroundColor Green
    } else {
        Write-Host "$Name not running on port $Port" -ForegroundColor Gray
    }
}

Stop-Port -Port 8000 -Name "Backend"
Stop-Port -Port 5173 -Name "Frontend"
