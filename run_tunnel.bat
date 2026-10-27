@echo off
title Cloudflare Permanent Tunnel - depas.my.id
cd /d "%~dp0"
echo ========================================================
echo       MEMULAI CLOUDFLARE PERMANENT TUNNEL (depas.my.id)
echo ========================================================
echo.
python scripts\tunnel.py
pause
