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
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup.ps1"
if errorlevel 1 goto failed
if exist bin\cloudflared.exe set BRIDGE_TUNNEL=1
rem Keep the bridge running: if it ever stops or crashes, start it again after 5 seconds
:run
node server.mjs
if errorlevel 3 if not errorlevel 4 goto running
echo.
echo The bridge stopped. Starting it again in 5 seconds... (close this window to stop it for good)
timeout /t 5 /nobreak >nul
goto run
:running
echo This window isn't needed: the bridge is already running in another window.
timeout /t 8 >nul
exit /b 0
:failed
pause
