@echo off
cd /d "%~dp0"
title GEMS and JEWELRY School admin dashboard - local test
node scripts\local-test.mjs
echo.
echo The server has stopped. Press any key to close this window.
pause >nul
