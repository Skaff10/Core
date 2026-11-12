# build_apk.ps1 - Builds standalone CORE Command Center .apk via EAS Cloud Build
$ErrorActionPreference = "Stop"

$mobileDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $mobileDir

Write-Host ">>> Triggering Standalone Android APK Build on EAS Cloud..." -ForegroundColor Cyan
$env:EAS_NO_VCS = "1"
npx eas-cli build -p android --profile preview --non-interactive

