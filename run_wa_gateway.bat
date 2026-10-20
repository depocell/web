@echo off
cd /d "%~dp0wa_gateway"
title WhatsApp Gateway - Web Report Depo Cell
echo ========================================================
echo   WHATSAPP GATEWAY - WEB REPORT DEPO CELL
echo ========================================================
echo Menjalankan WhatsApp Gateway service di http://127.0.0.1:3000 ...
node gateway.js
pause
