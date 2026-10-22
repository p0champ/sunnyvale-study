@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-AtLogin.ps1" -Uninstall
pause
