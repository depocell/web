@echo off
title Web Report dan DepAs Copilot
cd /d "C:\WEB REPORT"

echo ========================================================
echo       MENJALANKAN WEB REPORT DAN DEPAS COPILOT AI
echo ========================================================

:: 1. Bersihkan proses lama di port 8000 jika ada yang menggantung
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: 2. Bersihkan instance tele_bot.py lama jika ada
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*tele_bot.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: 3. Jalankan DepAs AI Copilot (@depas_ai_bot) di console terpisah / background
echo [1/2] Menyalakan DepAs AI Copilot (@depas_ai_bot)...
start "DepAs Copilot" /MIN python tele_bot.py

:: 4. Jalankan Web Report Server (FastAPI)
echo [2/2] Menyalakan Web Report Server di port 8000...
echo - Local: http://localhost:8000
echo - Public: https://depas.my.id (jika tunnel nyala)
echo - Copilot: @depas_ai_bot (Tanya AI aktif)
echo.
echo Tekan Ctrl+C untuk menghentikan server.
echo ========================================================

python server.py
pause
