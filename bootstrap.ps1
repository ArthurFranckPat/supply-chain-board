param(
    [switch]$InstallOnly,
    [switch]$StartOnly,
    [switch]$StartUi
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host "[bootstrap] $Message" -ForegroundColor Cyan
}

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RepoRoot

$VenvPath = Join-Path $RepoRoot ".venv"
$PythonExe = Join-Path $VenvPath "Scripts\python.exe"

if (-not $StartOnly) {
    if (-not (Test-Path $PythonExe)) {
        Write-Step "Creating virtual environment (.venv)..."
        py -3 -m venv $VenvPath
    }

    Write-Step "Upgrading pip..."
    & $PythonExe -m pip install --upgrade pip

    Write-Step "Installing shared packages..."
    & $PythonExe -m pip install -e "$RepoRoot\packages\domain-contracts"
    & $PythonExe -m pip install -e "$RepoRoot\packages\integration-sdk"

    Write-Step "Installing app dependencies..."
    & $PythonExe -m pip install -r "$RepoRoot\apps\production-planning\requirements.txt"
    & $PythonExe -m pip install -r "$RepoRoot\apps\suivi-commandes\requirements.txt"

    Write-Step "Installing integration-hub..."
    & $PythonExe -m pip install -e "$RepoRoot\services\integration-hub"

    if ($StartUi) {
        if (Get-Command npm -ErrorAction SilentlyContinue) {
            Write-Step "Installing board-ui npm dependencies..."
            Push-Location "$RepoRoot\apps\board-ui"
            npm install
            Pop-Location
        }
        else {
            Write-Warning "npm not found. board-ui dependencies were not installed."
        }
    }
}

if ($InstallOnly) {
    Write-Step "Install phase completed."
    exit 0
}

if (-not (Test-Path $PythonExe)) {
    throw "Python virtual environment not found at $PythonExe. Run .\\bootstrap.ps1 first."
}

function Start-ServiceWindow(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
) {
    $psCommand = "$host.UI.RawUI.WindowTitle = '$Title'; Set-Location '$WorkingDirectory'; $Command"
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", $psCommand | Out-Null
}

Write-Step "Starting production-planning API on http://127.0.0.1:8000"
Start-ServiceWindow \
    -Title "production-planning-api" \
    -WorkingDirectory "$RepoRoot\apps\production-planning" \
    -Command "& '$PythonExe' -m uvicorn production_planning.api.server:app --host 127.0.0.1 --port 8000 --reload"

Write-Step "Starting suivi-commandes API on http://127.0.0.1:8001"
Start-ServiceWindow \
    -Title "suivi-commandes-api" \
    -WorkingDirectory "$RepoRoot\apps\suivi-commandes" \
    -Command "& '$PythonExe' -m uvicorn api_server:app --host 127.0.0.1 --port 8001 --reload"

Write-Step "Starting integration-hub API on http://127.0.0.1:8010"
Start-ServiceWindow \
    -Title "integration-hub-api" \
    -WorkingDirectory "$RepoRoot\services\integration-hub" \
    -Command "& '$PythonExe' -m uvicorn integration_hub.api:app --host 127.0.0.1 --port 8010 --reload"

if ($StartUi) {
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        Write-Step "Starting board-ui on http://127.0.0.1:5173"
        Start-ServiceWindow \
            -Title "board-ui" \
            -WorkingDirectory "$RepoRoot\apps\board-ui" \
            -Command "if (-not (Test-Path 'node_modules')) { npm install }; npm run dev -- --host 127.0.0.1 --port 5173"
    }
    else {
        Write-Warning "npm not found. board-ui was not started."
    }
}

Write-Host ""
Write-Host "Services started:" -ForegroundColor Green
Write-Host "- production-planning API: http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "- suivi-commandes API:  http://127.0.0.1:8001" -ForegroundColor Green
Write-Host "- integration-hub API:  http://127.0.0.1:8010" -ForegroundColor Green
if ($StartUi) {
    Write-Host "- board-ui:             http://127.0.0.1:5173" -ForegroundColor Green
}
