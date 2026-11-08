@echo off
REM Double-click launcher to open Windows Defender Firewall for CORE backend
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [CORE] Requesting Administrator privileges to add firewall rule...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ===================================================
echo [CORE] Configuring Windows Defender Firewall for Port 8000
echo ===================================================
netsh advfirewall firewall delete rule name="CORE Backend Port 8000" >nul 2>&1
netsh advfirewall firewall add rule name="CORE Backend Port 8000" dir=in action=allow protocol=TCP localport=8000 profile=any
echo.
echo [CORE] SUCCESS! Port 8000 is now open for incoming TCP traffic.
echo [CORE] Your mobile phone can now connect to http://192.168.0.120:8000
echo ===================================================
pause

