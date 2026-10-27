@echo off
title Espelho Zumbi 90s
cd /d "%~dp0"
start "Servidor Espelho Zumbi" /min node server.js
timeout /t 2 /nobreak >nul
start "" "http://localhost:8031"
