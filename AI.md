# 🤖 DOKUMENTASI ARSITEKTUR & EKOSISTEM AI DEPAS

Dokumen ini adalah panduan resmi dan catatan teknis mengenai arsitektur kecerdasan buatan (**Google Gemini AI**) serta integrasi multi-kanal (**WhatsApp Gateway & Telegram Bot**) di dalam ekosistem **Web Report Depo Cell (My Astaga! & OKIPAY)**.

---

## 1. Roadmap & Pemisahan 3 Modul (3-Room Architecture)

Untuk menjaga stabilitas operasional, keamanan data, dan menghindari tumpang tindih dengan divisi lain (terutama Divisi Customer Service resmi di nomor `0857-7197-5556`), ekosistem AI dibagi tegas menjadi 3 modul:

| Modul | Kanal & Endpoint | Karakteristik & Kebijakan | Status Implementasi |
| :--- | :--- | :--- | :--- |
| **Task 1: WA Gateway Survei Churn** | WhatsApp (`081389779977`) via Baileys Port 3000 | • **Tanpa AI bebas** (menghindari jawaban salah / janji palsu ke konsumen).<br>• Outbound blast terukur dan terjadwal.<br>• Validasi nomor WhatsApp aktif (`onWhatsApp`).<br>• 1x Pesan penutup apresiasi mengarahkan ke CS resmi `0857-7197-5556`.<br>• Chat lanjutan dapat dibalas langsung manual lewat HP WhatsApp fisik bot. | **100% Selesai & Aktif di VPS** |
| **Task 2: AI Copilot di Web Report** | Dashboard `depas.my.id` (Menu Chat / Widget) | • Chat widget terintegrasi langsung di dashboard browser.<br>• Otak: Google Gemini Flash via `.env`.<br>• Analisa data transaksi internal, cabang, dan produk secara interaktif.<br>• Menghasilkan ringkasan visual & tabel on-demand. | **Ditahan Sementara** (menunggu pengerjaan tim sebelah selesai) |
| **Task 3: AI Asisten Pribadi Telegram** | Telegram Bot: **`@depas_ai_bot`** ([t.me/depas_ai_bot](https://t.me/depas_ai_bot)) | • Asisten pribadi 24 jam di smartphone manajemen.<br>• **100% Resmi & Anti-Banned** via Telegram Bot API.<br>• Fitur: Cek kesehatan VPS (`/server`), Daily Report (`/summary`), dan tanya jawab bebas berbasis Gemini AI.<br>• Service background: `depas-telebot.service`. | **100% Selesai & Aktif di VPS** |

---

## 2. Kredensial & Konfigurasi Environment (`.env`)

Seluruh kunci rahasia disimpan di file `.env` di root server (`c:\WEB REPORT\.env` di lokal dan `/var/www/webreport/.env` di VPS) dengan izin akses ketat (`chmod 600`), serta didaftarkan ke `.gitignore` agar tidak pernah terunggah ke repositori publik:

```ini
# Google Gemini AI API Key (disimpan di .env, jangan di-commit ke Git)
GEMINI_API_KEY="AQ.Ab8RN6...[DISIMPAN_DI_ENV]"

# Telegram Bot HTTP API Token (@depas_ai_bot)
TELEGRAM_BOT_TOKEN="8911669364:...[DISIMPAN_DI_ENV]"
```

### Spesifikasi Model Gemini:
* **Model Utama**: `gemini-flash-lite-latest` (Respon sub-detik ~0.3 - 0.5s, ultra-cepat, gratis kuota ribuan request harian).
* **Multi-Model Auto-Fallback**:
  Jika terjadi lonjakan trafik atau error HTTP 503 dari Google, sistem secara otomatis beralih ke model cadangan:
  $$\text{gemini-flash-lite-latest} \longrightarrow \text{gemini-3-flash-preview} \longrightarrow \text{gemini-flash-latest} \longrightarrow \text{gemini-3.5-flash} \longrightarrow \text{gemini-3.8-flash}$$

---

## 3. Detail Teknis Task 1: Eliminasi Akun Zombie & Smart Multi-Number WA

### A. Eliminasi Akun Zombie (~18.000 Akun Dibuang)
Pada master data mentah OtomaX (`C:\DEPASMYID\RESELLER\`), terdapat puluhan ribu data dari tahun 2014-2022 yang sudah tidak aktif:
* **`RS_ASTAGA.tsv`**: 25.916 akun mentah $\rightarrow$ 7.914 akun kosong/zombie & 10.841 akun kuno (< 2023) dibuang $\rightarrow$ **Tersisa 7.161 reseller aktif ($\ge$ 2023)**.
* **`RS_OKIPAY.tsv`**: 20.266 akun mentah $\rightarrow$ 17.646 akun kosong/zombie dibuang $\rightarrow$ **Tersisa 2.406 reseller aktif**.
* **Total Master Kontak Bersih**: **9.555 kontak mitra valid** tersimpan di tabel `reseller_contacts` database `MASTER/master_data.db`.

### B. Smart Multi-Number Detection & Auto-Promotion
Sebanyak 17,5% reseller memiliki lebih dari satu nomor pengirim di OtomaX (kombinasi SMS, Jabber `@c.us`, dan WA Center).
1. Seluruh nomor alternatif disimpan dalam format JSON di kolom `candidate_phones`.
2. Saat pemindaian WhatsApp berlangsung, Baileys memeriksa seluruh nomor kandidat secara paralel.
3. **Pemenang Otomatis**: Jika nomor awal berstatus Non-WA (mati), tetapi salah satu nomor alternatifnya aktif di WhatsApp, sistem otomatis mempromosikan nomor aktif tersebut menjadi `no_wa` utama dan menyimpannya ke database (`/api/survey/update-primary-phone`).
4. **Contoh Nyata**:
   * Reseller **NOVAL CELL (`AR02460`)** memiliki 4 nomor:
     * `6285887462078` (Mati)
     * `6285211059972` (Mati)
     * `6285813880008` (Mati)
     * `6281388980564` (🟢 **AKTIF DI WHATSAPP**)
   * Sistem otomatis mempromosikan `6281388980564` sebagai nomor utama, menampilkan badge hijau 🟢 di UI Web Report, dan meloloskannya untuk survei batch.

---

## 4. Detail Teknis Task 3: Telegram Bot Asisten Pribadi (`tele_bot.py`)

### A. Arsitektur Layanan
* **Metode Koneksi**: Long Polling Telegram Bot API (`getUpdates?timeout=30`).
  * Keunggulan: Hemat RAM (~25 MB), tanpa perlu port terbuka, tanpa konfigurasi webhook/SSL tambahan, dan otomatis *reconnect* jika jaringan terputus.
* **Service Background di VPS**:
  Dikelola oleh Systemd di `/etc/systemd/system/depas-telebot.service`:
  ```bash
  systemctl status depas-telebot   # Cek status bot
  systemctl restart depas-telebot  # Restart bot
  journalctl -u depas-telebot -f   # Pantau log real-time
  ```

### B. Daftar Perintah Menu Resmi Telegram (`@depas_ai_bot`)

Bot telah didaftarkan dengan menu resmi Telegram (`setMyCommands`) yang muncul pada tombol `[ Menu ≡ ]` di pojok kiri bawah keyboard:

| Perintah | Deskripsi & Fitur |
| :--- | :--- |
| **`/summary`** | 📸 **Laporan Visual HD My Astaga** + Run-rate harian, total sukses MTD, SLA speed, % sukses, dan member aktif. |
| **`/okipay`** | 📸 **Laporan Visual HD OKIPAY** + Run-rate harian, total sukses MTD, SLA speed, dan % sukses. |
| **`/sco`** | 📸 **Laporan Visual Potret HD Rekap Sales Cabang (SCO)** siap kirim/forward ke WhatsApp + evaluasi visit & target. |
| **`/cabang`** | 🏢 **Performa 5 Cabang** (BSD, ICON, PP, PRG, ONLINE) untuk server Astaga & OKIPAY lengkap dengan hit /hari. |
| **`/supplier`** | ⚠️ **Audit Modul Supplier Gagal** (AMC, PCU, MR, MARKAZ, METRO, dll) untuk identifikasi jalur melambat. |
| **`/drop`** | 📉 **Daftar 10 Toko/Agen Penurunan Terbesar** (run-rate drop /hari dan % penurunan MTD vs bulan lalu). |
| **`/mitra`** | 👥 **Database Reseller Aktif** (Total mitra terdaftar >= 2023, kontak WA terverifikasi, dan sebaran per cabang). |
| **`/server`** | 🖥️ **Kesehatan VPS** (Uptime, pemakaian RAM, sisa disk SSD, status service `webreport` & `wa-gateway`). |
| **`/help`** | ❓ Panduan lengkap navigasi bot dan petunjuk penggunaan. |

### C. Chatting Bebas, Model Fallback & Aturan Kejujuran (Strict Grounding)

1. **Aturan Karakter & Sapaan**:
   * Sapaan pimpinan: **"Bossque"** (kata *"Juragan"* diblokir permanen).
   * Mode: **Read-Only Data**. Tidak memberikan solusi/nasihat bisnis sok tahu kecuali jika diminta secara eksplisit.
   * Gaya: Dingin, bersih, to-the-point, tanpa simbol markdown berlebihan (`***`) dan tanpa tag HTML bocor.

2. **Aturan Kejujuran Mutlak (Zero Hallucination)**:
   * Jika data yang ditanyakan Bossque tidak terdapat di dalam snapshot data resmi server, bot **WAJIB menjawab jujur**:  
     `"Mohon maaf Bossque, data tersebut tidak tersedia di snapshot saya."`
   * Dilarang keras mengarang atau berasumsi angka.

3. **Multi-Model Fallback Resilient Chain**:
   * Prioritas 1: `gemini-3.5-flash-lite` (Ultra-fast, zero 503 spike)
   * Prioritas 2: `gemini-3-flash-preview`
   * Prioritas 3: `gemini-3.5-flash`
   * Prioritas 4: `gemini-3.7-flash`
   * Prioritas 5: `gemini-3.8-flash`
   * Timeout dinaikkan ke 25 detik dengan proteksi retry otomatis pada HTTP 503 / 429.

---

## 5. Ringkasan File Terkait

| File | Lokasi | Deskripsi |
| :--- | :--- | :--- |
| `tele_bot.py` | `c:\WEB REPORT\tele_bot.py` & `/var/www/webreport/` | Script utama Telegram Bot, routing menu, image sender & integrasi Gemini AI |
| `.env` | Root folder (Lokal & VPS) | File rahasia berisi API key dan Bot token |
| `pages/analisa/supplier_modules.json` | `pages/analisa/` (Lokal & VPS) | Audit performa modul/terminal supplier dan ranking transaksi gagal |
| `Daily_Report_ASTAGA_2026-10.png` | Root folder (Lokal & VPS) | Visual HD infografis harian My Astaga |
| `Daily_Report_OKIPAY_2026-10.png` | Root folder (Lokal & VPS) | Visual HD infografis harian OKIPAY |
| `Laporan_SCO_2026-10-21.png` | Root folder (Lokal & VPS) | Visual HD potret rekap sales cabang SCO siap forward WA |
| `engines/survey_engine.py` | `engines/` | Logika survei churn, multi-number lookup & promo kontak |
| `pages/survey/survey.js` | `pages/survey/` | Frontend kontrol survei, verifikasi WA, dan badge nomor cadangan |
| `scripts/import_reseller_contacts.py` | `scripts/` | Script pembersihan akun zombie & impor master kontak |
| `MASTER/master_data.db` | `MASTER/` | Database SQLite berisi `resellers`, `reseller_contacts`, `survey_churn_logs` |

---
*Dokumen ini diperbarui secara berkala sebagai Single Source of Truth teknis untuk seluruh integrasi AI di ekosistem DepAs.*
