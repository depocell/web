# =============================================================================
# VPS.md - PANDUAN DEPLOYMENT & KOORDINASI DUAL-PROJECT DI VPS
# Depot Pulsa (SERPUL) & Web Report (depas.my.id)
# =============================================================================

## 1. SPESIFIKASI & ARSITEKTUR VPS LIVE

* **Alamat IP Publik VPS**: `185.205.222.170`
* **OS & Runtime**: Ubuntu Linux, Python 3.12, Node.js v20+
* **Process Manager**: PM2 (Auto-start saat reboot)
* **Status Dual-Project**:
  | Project | Folder di VPS | Port Aktif | URL Akses Langsung | Service PM2 |
  | :--- | :--- | :--- | :--- | :--- |
  | **Depot Pulsa (DP)** | `/var/www/serpul` | `3000` | `http://185.205.222.170:3000` | `serpul` |
  | **Web Report** | `/var/www/webreport` | `8000` | `http://185.205.222.170:8000` | `webreport` |

---

## 2. ATURAN WAJIB UNTUK DEVELOPER / AI AGENT WEB REPORT

1. **Alokasi Port 8000 (JANGAN DIUBAH KE 3000)**:
   - Port `3000` adalah milik server Depot Pulsa.
   - Web Report **WAJIB** berjalan di Port `8000`.
   - Host binding wajib `0.0.0.0` agar bisa diakses via IP publik VPS.
2. **Virtual Environment Python di VPS**:
   - Lokasi venv: `/var/www/webreport/venv`
   - Binary Python: `/var/www/webreport/venv/bin/python3`
3. **Tunnel Laptop Tidak Perlu Dinyalakan Lagi**:
   - Karena Web Report sudah live 24 jam di VPS (`http://185.205.222.170:8000`), file `run_tunnel.bat` di laptop **tidak perlu lagi dijalankan**.
   - Untuk mengarahkan domain `depas.my.id`, cukup ubah DNS A Record di Cloudflare ke `185.205.222.170`.

---

## 3. COMMAND PM2 UNTUK KONTROL WEB REPORT DI VPS

* **Menjalankan / Mendaftarkan Service**:
  ```bash
  cd /var/www/webreport
  pm2 start "venv/bin/python3 server.py" --name "webreport"
  pm2 save
  ```
* **Melihat Status Kedua Aplikasi**:
  ```bash
  pm2 status
  ```
* **Restart Service Web Report Saja**:
  ```bash
  pm2 restart webreport
  ```
* **Melihat Live Log Web Report**:
  ```bash
  pm2 logs webreport --lines 50
  ```

---

## 4. ALUR UPDATE & DEPLOYMENT DARI LOKAL KE VPS

1. Developer/Agent Web Report melakukan perubahan di `C:\WEB REPORT`.
2. Commit & push ke repository GitHub:
   ```bash
   git add .
   git commit -m "update: penjelasan fitur"
   git push origin main
   ```
3. Koordinasi dengan PM Serpul (atau jalankan script deploy) untuk pull ke VPS:
   ```bash
   cd /var/www/webreport
   git pull origin main
   pm2 restart webreport
   ```

---

## 5. CATATAN KOORDINASI ANTAR-AGEN (SHARED MEMORY)
* *13 Nov 2026*: Web Report resmi diintegrasikan ke VPS `185.205.222.170` pada port `8000` berdampingan dengan Depot Pulsa (port `3000`). Resource memory & CPU terisolasi aman di bawah PM2.
