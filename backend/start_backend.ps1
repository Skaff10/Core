<#
  CORE Backend Launcher
  ---------------------
  - Locates a real (non-Microsoft-Store) Python interpreter
  - Validates the .venv actually runs; rebuilds it automatically if broken
  - Reinstalls dependencies only when requirements.txt changes
  - Frees port 8000 if a stale CORE server is still bound
  - Opens the local Control Panel and runs the server in this window
#>
param(
    [switch]$NoBrowser,
    [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root
$Host.UI.RawUI.WindowTitle = "CORE Backend Server"

function Say($msg, $color = "Cyan") { Write-Host "[CORE] $msg" -ForegroundColor $color }

# --- Read PORT from .env (default 8000) ---------------------------------------
$Port = 8000
if (Test-Path "$Root\.env") {
    $line = Get-Content "$Root\.env" | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1
    if ($line) { $Port = [int](($line -split '=', 2)[1].Trim()) }
}

# --- Locate a real Python interpreter -----------------------------------------
function Test-Python($exe) {
    if (-not $exe -or -not (Test-Path $exe)) { return $false }
    if ($exe -like "*\WindowsApps\*") { return $false }   # Store alias: unreliable for venvs
    try {
        $out = & $exe -c "import sys; print(sys.version_info >= (3, 10))" 2>$null
        return ($LASTEXITCODE -eq 0 -and $out -eq "True")
    } catch { return $false }
}

function Find-Python {
    $candidates = @()
    foreach ($v in "313", "314", "312", "311") {
        $candidates += "$env:LOCALAPPDATA\Programs\Python\Python$v\python.exe"
        $candidates += "$env:ProgramFiles\Python$v\python.exe"
    }
    $candidates += (Get-Command python.exe -All -ErrorAction SilentlyContinue | ForEach-Object Source)
    foreach ($c in $candidates) { if (Test-Python $c) { return $c } }
    return $null
}

$VenvPy = "$Root\.venv\Scripts\python.exe"
$venvHealthy = (-not $Rebuild) -and (Test-Path $VenvPy) -and (Test-Python $VenvPy)
if ($venvHealthy) {
    # Also reject venvs whose base interpreter is the Store alias
    $cfg = Get-Content "$Root\.venv\pyvenv.cfg" -Raw -ErrorAction SilentlyContinue
    if ($cfg -match "WindowsApps") { $venvHealthy = $false }
}

if (-not $venvHealthy) {
    $BasePy = Find-Python
    if (-not $BasePy) {
        Say "No usable Python 3.10+ found." "Red"
        Say "Install it with:  winget install Python.Python.3.13 --scope user" "Yellow"
        Read-Host "Press Enter to exit"
        exit 1
    }
    Say "Building virtual environment with $BasePy" "Yellow"
    if (Test-Path "$Root\.venv") { Remove-Item "$Root\.venv" -Recurse -Force }
    & $BasePy -m venv "$Root\.venv"
    if ($LASTEXITCODE -ne 0) { Say "venv creation failed." "Red"; Read-Host "Press Enter to exit"; exit 1 }
    Remove-Item "$Root\.venv\.requirements.hash" -ErrorAction SilentlyContinue
}

# --- Install dependencies only when requirements.txt changes ------------------
$ReqHash = (Get-FileHash "$Root\requirements.txt" -Algorithm SHA256).Hash
$HashFile = "$Root\.venv\.requirements.hash"
$stored = if (Test-Path $HashFile) { (Get-Content $HashFile -Raw).Trim() } else { "" }
if ($stored -ne $ReqHash) {
    Say "Installing / updating dependencies..." "Yellow"
    & $VenvPy -m pip install --upgrade pip --quiet
    & $VenvPy -m pip install -r "$Root\requirements.txt" --quiet
    if ($LASTEXITCODE -ne 0) { Say "Dependency install failed." "Red"; Read-Host "Press Enter to exit"; exit 1 }
    Set-Content $HashFile $ReqHash
}

# --- Free the port if a stale server is holding it ----------------------------
$holders = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
foreach ($procId in $holders) {
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -like "python*") {
        Say "Stopping stale server on port $Port (PID $procId)" "Yellow"
        Stop-Process -Id $procId -Force
        Start-Sleep -Milliseconds 800
    } elseif ($p) {
        Say "Port $Port is used by '$($p.ProcessName)' (PID $procId). Change PORT in .env or close it." "Red"
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# --- Check Windows Firewall for Mobile LAN Access ----------------------------
$fwRule = Get-NetFirewallRule -DisplayName "CORE Backend Port $Port" -ErrorAction SilentlyContinue
if (-not $fwRule) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($isAdmin) {
        Say "Creating Windows Defender Firewall allow rule for port $Port..." "Yellow"
        netsh advfirewall firewall add rule name="CORE Backend Port $Port" dir=in action=allow protocol=TCP localport=$Port | Out-Null
        Say "Windows Firewall rule created for port $Port." "Green"
    } else {
        Say "Notice: To allow mobile phones to connect over LAN Wi-Fi, run open_firewall_port.bat as Administrator." "DarkYellow"
    }
}

# --- Launch -------------------------------------------------------------------
$lan = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.PrefixOrigin -in "Dhcp", "Manual" -and $_.IPAddress -notlike "169.*" } |
    Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host ""
Say "Control Panel : http://localhost:$Port" "Green"
if ($lan) { Say "Mobile target : $($lan):$Port" "Green" }
Say "Press Ctrl+C to stop." "DarkGray"
Write-Host ""

if (-not $NoBrowser) {
    Start-Job -ScriptBlock { param($u) Start-Sleep 2; Start-Process $u } -ArgumentList "http://localhost:$Port" | Out-Null
}

& $VenvPy "$Root\main.py"
$code = $LASTEXITCODE
if ($code -ne 0) {
    Say "Server exited with code $code." "Red"
    Read-Host "Press Enter to close"
}

