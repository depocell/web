@echo off
title Menghentikan Web Report dan DepAs Copilot
cd /d "C:\WEB REPORT"

echo Menghentikan Web Report (Port 8000)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo Menghentikan DepAs AI Copilot (@depas_ai_bot)...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*tele_bot.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo Selesai. Seluruh layanan Web Report dan Copilot telah dihentikan.
ping 127.0.0.1 -n 2 >nul
