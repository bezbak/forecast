# Запуск терминала прогноза одной командой: .\run.ps1
# Параметр -Build пересобирает фронтенд принудительно, -NoBrowser не открывает браузер.
param([switch]$Build, [switch]$NoBrowser)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Host "Не найдено виртуальное окружение .venv. Сначала выполните установку из README." -ForegroundColor Red
    exit 1
}

if ($Build -or -not (Test-Path (Join-Path $root "frontend\dist\index.html"))) {
    Write-Host "Сборка фронтенда..."
    npm --prefix (Join-Path $root "frontend") run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$env:PYTHONIOENCODING = "utf-8"
$url = "http://127.0.0.1:8000"

# Браузер открывается через пару секунд, когда сервер уже поднят
if (-not $NoBrowser) {
    Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile", "-Command", "Start-Sleep -Seconds 3; Start-Process '$url'"
}

Write-Host "Терминал прогноза: $url  (остановить: Ctrl+C)"
& $python -m uvicorn forecast.api.app:app --app-dir (Join-Path $root "backend") --host 127.0.0.1 --port 8000
