@echo off
REM Double-click launcher for the CORE backend. All logic lives in start_backend.ps1.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_backend.ps1" %*
