@echo off
echo [CORE] Requesting Administrator permission to allow Port 8000 through Windows Firewall...
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -Command New-NetFirewallRule -DisplayName \"Core Backend Port 8000\" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow -Profile Any -Description \"Allows Core mobile command center to communicate with PC on port 8000\"; Write-Host \"[SUCCESS] Port 8000 is now open on Windows Firewall!\"; Start-Sleep 3'"

