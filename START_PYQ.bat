@echo off
title GATE PYQ Practice
cd /d "%~dp0server"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  Node.js is not installed on this PC.
    echo  Install the LTS version from https://nodejs.org  ^(one-time step^), then double-click this file again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=1,2 delims=." %%a in ('node -p "process.versions.node"') do (set NMAJ=%%a& set NMIN=%%b)
if %NMAJ% LSS 22 goto oldnode
if %NMAJ% EQU 22 if %NMIN% LSS 13 goto oldnode
goto run

:oldnode
echo.
echo  Your Node.js is too old ^(need 22.13 or newer^). Install the current LTS from https://nodejs.org
echo.
pause
exit /b 1

:run
echo.
echo  ========================================
echo        GATE PYQ Practice  (public host)
echo  ========================================
echo.
start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3002"
node --no-warnings index.js
echo.
echo  The server stopped. See the message above.
pause
