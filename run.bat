@echo off
title GymLab Dev Server
echo.
echo   GymLab - Hot Reload Dev Server
echo   ===============================
echo.
echo   Opening http://localhost:8080
echo   Edit src/ files - browser auto-reloads!
echo.
cd /d "%~dp0"
python dev-server.py
pause
