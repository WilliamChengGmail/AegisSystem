@echo off
cd /d "%~dp0"
start "Aegis Local Server" powershell.exe -NoExit -ExecutionPolicy Bypass -File "%~dp0start-local-server.ps1"
exit
