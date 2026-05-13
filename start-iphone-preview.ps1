$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$env:EXPO_HOME = Join-Path $projectRoot ".expo-home"
$env:EXPO_NO_TELEMETRY = "1"

Write-Host "Starting FitMate AI iPhone preview..."
Write-Host "Project: $projectRoot"
Write-Host "Port: 8099"
Write-Host ""
Write-Host "On iPhone: install Expo Go, keep phone and PC on the same Wi-Fi, then scan the QR code."
Write-Host ""

npx.cmd expo start --lan --port 8099
