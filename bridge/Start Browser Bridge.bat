@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js LTS from https://nodejs.org then open this file again.
  pause
  exit /b 1
)
if not exist node_modules call npm.cmd ci
if errorlevel 1 goto failed
call npx.cmd playwright install chromium
if errorlevel 1 goto failed
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup.ps1"
if errorlevel 1 goto failed
if exist bin\cloudflared.exe set BRIDGE_TUNNEL=1
node server.mjs
:failed
pause
