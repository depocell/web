@echo off
title Update & Sync Web Report ke depas.my.id
color 0b

echo =======================================================
echo    SINKRONISASI DATA WEB REPORT KE CLOUD DEPAS.MY.ID
echo =======================================================
echo.

cd /d "c:\WEB REPORT"

echo [1/2] Menjalankan sinkronisasi database dan cache parquet...
python -c "import engines.sync_vps_engine as s; res = s.sync_to_vps(); print(res.get('message') or res.get('error')); exit(0 if res.get('ok') else 1)"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =======================================================
    echo    BERHASIL! Data di https://depas.my.id sudah LIVE!
    echo =======================================================
) else (
    echo.
    echo =======================================================
    echo    GAGAL! Periksa koneksi internet atau konfigurasi VPS.
    echo =======================================================
)

echo.
pause
