# install_context_menu.ps1 - Registers 'Send to Mobile (CORE)' in Windows 11 Context Menu
$ErrorActionPreference = "Stop"

$backendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonw = Join-Path $backendDir ".venv\Scripts\pythonw.exe"
if (-not (Test-Path $pythonw)) {
    $pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
}
if (-not $pythonw -or -not (Test-Path $pythonw)) {
    Write-Error "Could not locate pythonw.exe in backend\.venv\Scripts or system PATH."
    exit 1
}

$scriptPath = Join-Path $backendDir "send_to_mobile.pyw"
if (-not (Test-Path $scriptPath)) {
    Write-Error "Could not locate send_to_mobile.pyw at $scriptPath"
    exit 1
}

$cmdString = "`"$pythonw`" `"$scriptPath`" `"%1`""

# 1. Register in HKCU context menu for all files
$regKey = "HKCU:\Software\Classes\*\shell\SendToMobile"
New-Item -Path $regKey -Force | Out-Null
Set-ItemProperty -Path $regKey -Name "(Default)" -Value "Send to Mobile (CORE)" -Force
Set-ItemProperty -Path $regKey -Name "Icon" -Value "imageres.dll,-5302" -Force

$cmdKey = "$regKey\command"
New-Item -Path $cmdKey -Force | Out-Null
Set-ItemProperty -Path $cmdKey -Name "(Default)" -Value $cmdString -Force

# 2. Also register in Windows 'Send to' menu (%APPDATA%\Microsoft\Windows\SendTo)
$sendToDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::SendTo)
if (Test-Path $sendToDir) {
    $wsh = New-Object -ComObject WScript.Shell
    $shortcutPath = Join-Path $sendToDir "Mobile (CORE).lnk"
    $shortcut = $wsh.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $pythonw
    $shortcut.Arguments = "`"$scriptPath`""
    $shortcut.Description = "Send file directly to CORE Mobile App"
    $shortcut.IconLocation = "imageres.dll,-5302"
    $shortcut.Save()
    Write-Host "[OK] Added to 'Send to' menu: $shortcutPath"
}

Write-Host "[SUCCESS] 'Send to Mobile (CORE)' registered in Windows Context Menu!"
Write-Host "You can now right-click any file -> 'Send to Mobile (CORE)' or 'Send to' -> 'Mobile (CORE)'."

