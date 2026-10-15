@echo off
title Web Report Server
cd /d "C:\WEB REPORT"
echo ==============================================
echo           MENJALANKAN WEB REPORT
echo ==============================================
echo Membuka browser: http://localhost:8000 ...
echo Tekan Ctrl+C untuk menghentikan server.
echo.

python server.py
pause
