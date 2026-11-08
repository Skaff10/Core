# uninstall_context_menu.ps1 - Removes 'Send to Mobile (CORE)' from Windows 11 Context Menu
$ErrorActionPreference = "SilentlyContinue"

$regKey = "HKCU:\Software\Classes\*\shell\SendToMobile"
if (Test-Path $regKey) {
    Remove-Item -Path $regKey -Recurse -Force
    Write-Host "[OK] Removed HKCU context menu key."
}

$sendToDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::SendTo)
$shortcutPath = Join-Path $sendToDir "Mobile (CORE).lnk"
if (Test-Path $shortcutPath) {
    Remove-Item -Path $shortcutPath -Force
    Write-Host "[OK] Removed 'Send to' shortcut."
}

Write-Host "[SUCCESS] 'Send to Mobile (CORE)' uninstalled."

