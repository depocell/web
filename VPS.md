# =============================================================================
# VPS.md - PANDUAN DEPLOYMENT & KOORDINASI DUAL-PROJECT DI VPS
# Depot Pulsa (SERPUL) & Web Report (depas.my.id)
# =============================================================================

## 1. SPESIFIKASI & ARSITEKTUR VPS LIVE

* **Alamat IP Publik VPS**: `185.205.222.170`
* **Domain Utama**: `https://depas.my.id` (Cloudflare Proxied A-Record `@` -> `185.205.222.170`)
* **Web Server & SSL**: Nginx Reverse Proxy + Let's Encrypt SSL Certbot
* **OS & Runtime**: Ubuntu Linux, 2 vCPU, 2 GB RAM + 2 GB Swap, Python 3.12, Node.js v20+
* **Process Manager**: PM2 (Auto-start saat server reboot)
* **Status Dual-Project**:
  | Project | Folder di VPS | Port Internal | URL Akses Langsung | Service PM2 | Domain / Reverse Proxy |
  | :--- | :--- | :--- | :--- | :--- | :--- |
  | **Depot Pulsa (DP)** | `/var/www/serpul` | `3000` | `http://185.205.222.170:3000` | `serpul` | - |
  | **Web Report** | `/var/www/webreport` | `8000` | `http://185.205.222.170:8000` | `webreport` | `https://depas.my.id` |

---

## 2. ARSITEKTUR HYBRID TWO-TIER: DAPUR VS ETALASE

1. **Laptop Workstation Lokal (`WebReportAdmin.exe` / `http://localhost:8000`) = DAPUR UTAMA**:
   - Membaca raw TSV dari `C:\DMS RAW DATA\`.
   - Mengolah data menjadi Parquet bulanan/tahunan (`.cache/`).
   - Memiliki menu eksklusif: **`#admin` (Admin & Olah Data)** dan **`#pivot-admin` (Pivot Admin)**.
   - Mengontrol sinkronisasi ke VPS melalui Tab **"Sync & Status VPS"** dengan Live Streaming Terminal (SSE).

2. **Cloud VPS (`https://depas.my.id`) = ETALASE PUBLIK**:
   - Mode default pengunjung internet adalah **Tamu (Auto-Viewer)** tanpa perlu login password.
   - Menu Dapur (`#admin` & `#pivot-admin`) dan label `Dapur & Admin` **DISEMBUNYIKAN TOTAL** (`display: none !important`).
   - Endpoint `/api/admin/*` dan `/pages/admin/*` menolak akses publik dengan `403 Forbidden`.
   - Menu `Daily Report` dan `SCO Suite` berdiri sendiri di bawah label **`Manajemen & Sales`**.

---

## 3. ATURAN WAJIB UNTUK DEVELOPER / AI AGENT WEB REPORT

1. **Alokasi Port 8000 (JANGAN DIUBAH KE 3000)**:
   - Port `3000` adalah milik server Depot Pulsa.
   - Web Report **WAJIB** berjalan di Port `8000`.
   - Host binding wajib `0.0.0.0` agar bisa diakses oleh Nginx reverse proxy.
2. **Virtual Environment Python di VPS**:
   - Lokasi venv: `/var/www/webreport/venv`
   - Binary Python: `/var/www/webreport/venv/bin/python3`
3. **Tunnel Laptop Cloudflared Tidak Dipakai Lagi**:
   - Cloudflare Tunnel laptop (`59fd72d6-ab0f-472d-938f-b7793ec7203d`) sudah di-release.
   - DNS `@` dan `www` di `dash.cloudflare.com` sudah diarahkan langsung via A-Record ke IP VPS `185.205.222.170` (Proxied).
4. **Protokol Koneksi SFTP / SSH Paramiko (Anti RuntimeError)**:
   - JANGAN pernah menggunakan `paramiko.Transport` mentah untuk retry/reconnect. Gunakan selalu `paramiko.SSHClient` dengan `client.open_sftp()`.
5. **Escape Karakter Ampersand di Batch File**:
   - Karakter `&` di command prompt adalah operator chaining. Di batch file wajib di-escape: `title Update ^& Sync Web Report ke depas.my.id`.

---

## 4. COMMAND PM2 UNTUK KONTROL WEB REPORT DI VPS

* **Melihat Status Kedua Aplikasi**:
  ```bash
  pm2 status
  ```
* **Restart Service Web Report Saja**:
  ```bash
  pm2 restart webreport
  ```
* **Reload Service Tanpa Downtime**:
  ```bash
  pm2 reload webreport
  ```
* **Melihat Live Log Web Report**:
  ```bash
  pm2 logs webreport --lines 50
  ```

---

## 5. ALUR UPDATE & DEPLOYMENT DARI LOKAL KE VPS

1. Developer/Agent Web Report melakukan perubahan kode di `C:\WEB REPORT`.
2. Commit & push ke repository GitHub:
   ```bash
   git add .
   git commit -m "feat/fix: deskripsi perubahan"
   git push origin main
   ```
3. Update kode di VPS via SSH / terminal:
   ```bash
   cd /var/www/webreport
   git pull origin main
   pm2 reload webreport
   ```
   *(Atau klik tombol **"Mulai Sinkronisasi Sekarang"** di Tab "Sync & Status VPS" pada Web Report Admin lokal).*

---

## 6. LOG HISTORI KOORDINASI & PERUBAHAN
* *13 Nov 2026 (Pagi)*: Web Report resmi terintegrasi ke VPS `185.205.222.170` port `8000` berdampingan dengan Depot Pulsa (port `3000`).
* *13 Nov 2026 (Sore)*: Domain `depas.my.id` dialihkan dari Cloudflare Tunnel laptop langsung ke VPS IP via A-Record. Nginx reverse proxy + SSL Let's Encrypt aktif 24/7.
* *13 Nov 2026 (Malam)*:
  - Tab "Sync & Status VPS" dengan Live Streaming Terminal (SSE) resmi aktif di halaman Admin lokal.
  - Fix Paramiko `threads can only be started once` menggunakan `SSHClient.open_sftp()`.
  - Fix Windows batch escaping `title Update ^& Sync...`.
  - Penguncian Dapur Olah Data (`#admin` & `#pivot-admin`): 100% eksklusif untuk laptop lokal, disembunyikan total dari `depas.my.id`.
  - Menu `Daily Report` & `SCO Suite` dipindahkan ke kelompok `Manajemen & Sales`.
