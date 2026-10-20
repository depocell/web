@echo off
cd /d "%~dp0wa_gateway"
title Reset Sesi WhatsApp Bot
echo ========================================================
echo   RESET SESI WHATSAPP BOT (GANTI NOMOR)
echo ========================================================
echo.
echo Menghapus sesi lama agar bisa scan QR dengan nomor baru...
if exist session (
    rmdir /s /q session
    echo [OK] Sesi WhatsApp lama berhasil dihapus!
) else (
    echo Sesi belum ada.
)
echo.
echo Sekarang silakan jalankan "run_wa_gateway.bat" untuk scan QR dengan nomor baru.
echo ========================================================
pause
