# 🤖 DOKUMENTASI ARSITEKTUR & EKOSISTEM AI DEPAS

Dokumen ini adalah panduan resmi dan catatan teknis mengenai arsitektur kecerdasan buatan (**Google Gemini AI**) serta integrasi multi-kanal (**Telegram Bot & Controller**) di dalam ekosistem **Web Report Depo Cell (My Astaga! & OKIPAY)**.

> [!IMPORTANT]
> **STATUS INFRASTRUKTUR SAAT INI:**  
> 1. **Server VPS:** **DINONAKTIFKAN TOTAL (OFF TOTAL / DECOMMISSIONED).**  
> 2. **WhatsApp Gateway (Port 3000):** **DINONAKTIFKAN TOTAL (OFF TOTAL).** Seluruh aktivitas blast survei dan gateway outbound telah dihentikan permanen. Seluruh master data kontak valid dan histori tersimpan aman di database SQLite lokal.  
> 3. **Pusat Ekosistem:** Seluruh infrastruktur Web Report, engine analitik, database, dan AI Bot kini berjalan **100% di Laptop Localhost**, dengan akses publik internet via **Cloudflare Tunnel (`https://depas.my.id`)**.

---

## 1. Roadmap & Pemisahan 4 Modul (Multi-Agent Architecture)

Untuk menjaga stabilitas operasional, keamanan data, dan pemisahan wewenang, ekosistem AI dibagi tegas menjadi 4 modul:

| Modul | Kanal & Endpoint | Karakteristik & Kebijakan | Status Operasional |
| :--- | :--- | :--- | :--- |
| **Task 1: WA Gateway Survei Churn** | WhatsApp (`081389779977`) Port 3000 | • Outbound blast survei churn & validasi `onWhatsApp`.<br>• Mengarahkan ke CS resmi `0857-7197-5556`.<br>• Layanan saat ini telah dihentikan total.<br>• Master database kontak valid tetap diarsipkan di lokal. | 🔴 **OFF TOTAL (Dinonaktifkan)** |
| **Task 2: AI Copilot di Web Report** | Dashboard `depas.my.id` (Menu Chat / Widget) | • Chat widget terintegrasi langsung di dashboard browser.<br>• Otak: Google Gemini Flash via `.env`.<br>• Analisa data transaksi internal, cabang, dan produk secara interaktif.<br>• Menghasilkan ringkasan visual & tabel on-demand. | **Ditahan Sementara** (Dialihkan ke Bot Telegram) |
| **Task 3: AI Asisten Eksekutif Telegram** | Telegram Bot: **`@depas_ai_bot`** ([t.me/depas_ai_bot](https://t.me/depas_ai_bot)) | • Asisten pribadi & reader data 24 jam untuk manajemen (**Bossque**).<br>• **100% Resmi & Anti-Banned** via Telegram Bot API.<br>• Fitur: Daily Report HD (`/summary`), performa cabang (`/cabang`), audit supplier (`/supplier`), pantau tiket eskalasi (`/tiket`), dan tanya jawab data transaksi.<br>• Mode: **Read-Only Data** dengan *Zero Hallucination*. | 🟢 **100% Aktif di Laptop** (`tele_bot.py`) |
| **Task 4: Ompasha Laptop Dev Agent** | Telegram Bot: **`@ompasha_bot`** ([t.me/ompasha_bot](https://t.me/ompasha_bot)) | • Asisten dev & controller laptop pribadi (**Bro**) di `C:\LAPTOP_AGENT`.<br>• **Gemini Function Calling (Tool Use)**: PowerShell (`run_command`), baca/tulis/edit file, cek direktori.<br>• **Local Data Center**: Menyelesaikan tiket eskalasi (`resolve_ticket`) dari `@depas_ai_bot`.<br>• **Remote Control 100% Silent**: Menyalakan/mematikan Web Report port 8000 & Cloudflare Tunnel. | 🟢 **100% Aktif di Laptop** (`agent.py`) |

---

## 2. Kredensial & Konfigurasi Environment (`.env` & `config.json`)

Seluruh kredensial rahasia disimpan di penyimpanan lokal laptop dan didaftarkan ke `.gitignore` agar tidak pernah terunggah ke repositori publik:

### A. Environment Web Report & DepAs Copilot (`C:\WEB REPORT\.env`)
```ini
# Google Gemini AI API Key
GEMINI_API_KEY="AQ.Ab8RN6...[DISIMPAN_DI_ENV]"

# Telegram Bot HTTP API Token (@depas_ai_bot)
TELEGRAM_BOT_TOKEN="8911669364:...[DISIMPAN_DI_ENV]"
```

### B. Konfigurasi Laptop Dev Agent (`C:\LAPTOP_AGENT\config.json`)
```json
{
  "telegram_token": "8818488536:...[DISIMPAN_DI_CONFIG]",
  "gemini_api_keys": [
    "AQ.Ab8RN6...[KEY_1]",
    "AQ.Ab8RN6...[KEY_2]"
  ],
  "admin_chat_id": 6166710846,
  "default_working_dir": "C:\\",
  "models": [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash"
  ]
}
```

### Spesifikasi Model Gemini:
* **Model Utama**: `gemini-3.5-flash-lite` (Respon sub-detik ~0.3 - 0.5s, hemat kuota, minim latency).
* **Model Cadangan (Fallback)**: `gemini-3.8-flash` (Kapasitas penalaran tinggi untuk analisa rumit dan eksekusi tool).
* **Multi-Key Auto-Rotation**: Pada `C:\LAPTOP_AGENT`, agent mendukung rotasi otomatis antar API key jika salah satu kunci mencapai kuota limit harian (HTTP 429/503).

---

## 3. Catatan Master Reseller Bersih & Smart Multi-Number WA (Layanan WA: OFF Total)

> [!NOTE]
> **Layanan WhatsApp Gateway (Port 3000 Baileys) saat ini sudah DINONAKTIFKAN TOTAL (OFF).**  
> Catatan teknis di bawah ini adalah dokumentasi hasil kurasi data pembersihan akun zombie yang tersimpan secara permanen di database lokal `MASTER/master_data.db` dan tetap digunakan oleh engine analitik Web Report.

### A. Eliminasi Akun Zombie (~18.000 Akun Dibuang)
Pada master data mentah OtomaX (`C:\DEPASMYID\RESELLER\`), puluhan ribu data lama (2014-2022) telah dibersihkan:
* **`RS_ASTAGA.tsv`**: 25.916 akun mentah $\rightarrow$ 7.914 akun kosong/zombie & 10.841 akun kuno (< 2023) dibuang $\rightarrow$ **Tersisa 7.161 reseller aktif ($\ge$ 2023)**.
* **`RS_OKIPAY.tsv`**: 20.266 akun mentah $\rightarrow$ 17.646 akun kosong/zombie dibuang $\rightarrow$ **Tersisa 2.406 reseller aktif**.
* **Total Master Kontak Bersih**: **9.555 kontak mitra valid** tersimpan di tabel `reseller_contacts` database SQLite lokal [`MASTER/master_data.db`](file:///c:/WEB%20REPORT/MASTER/master_data.db).

### B. Smart Multi-Number Detection & Auto-Promotion
Sebanyak 17,5% reseller memiliki lebih dari satu nomor pengirim di OtomaX (kombinasi SMS, Jabber `@c.us`, dan WA Center).
1. Seluruh nomor alternatif disimpan dalam format JSON di kolom `candidate_phones`.
2. Jika nomor utama tidak aktif di WA, sistem memeriksa nomor alternatif.
3. Nomor alternatif yang aktif otomatis dipromosikan menjadi `no_wa` utama di database (`/api/survey/update-primary-phone`).

---

## 4. Detail Teknis Task 3: Telegram Bot Asisten Eksekutif (`tele_bot.py`)

### A. Arsitektur Layanan di Laptop
* **Metode Koneksi**: Long Polling Telegram Bot API (`getUpdates?timeout=30`).
  * Hemat RAM (~25 MB), tanpa perlu port terbuka, tanpa webhook/SSL tambahan, otomatis *reconnect*.
* **Pengelolaan Proses di Laptop**:
  - Dijalankan otomatis bersamaan dengan web server melalui [`run_report.bat`](file:///c:/WEB%20REPORT/run_report.bat):
    ```bat
    start "DepAs Copilot" /MIN python tele_bot.py
    python server.py
    ```
  - Dihentikan secara bersih melalui [`stop_report.bat`](file:///c:/WEB%20REPORT/stop_report.bat).
  - Atau dikontrol hening (100% Silent) melalui Ompasha Agent (`@ompasha_bot`).

### B. Daftar Perintah Menu Resmi Telegram (`@depas_ai_bot`)

Menu resmi Telegram (`setMyCommands`) yang muncul pada tombol `[ Menu ≡ ]`:

| Perintah | Label Menu (`setMyCommands`) | Deskripsi & Sumber Data |
| :--- | :--- | :--- |
| **`/overview`** | **Executive Overview** | 📊 Ringkasan konsolidasi perbandingan eksekutif ASTAGA vs OKIPAY vs TOTAL (Run-rate, hit sukses, speed SLA, basis reseller, dan top cabang). *(Sumber: `#overview`)* |
| **`/summary`** | **Daily Astaga** | 📸 **Laporan Visual HD My Astaga** + Run-rate harian, total sukses MTD, SLA speed, % sukses, dan member aktif. *(Sumber: `Daily_Report_ASTAGA_2026-10.png` & `data.json`)* |
| **`/okipay`** | **Daily Okipay** | 📸 **Laporan Visual HD OKIPAY** + Run-rate harian, total sukses MTD, SLA speed, dan % sukses. *(Sumber: `Daily_Report_OKIPAY_2026-10.png` & `data.json`)* |
| **`/sco`** | **Daily SCO** | 📸 **Laporan Visual Rekap Sales Cabang (SCO)** siap kirim/forward ke WhatsApp + evaluasi visit & target. *(Sumber: `data_sco.json`)* |
| **`/cabang`** | **Branch Perform** | 🏢 **Performa 5 Cabang** (BSD, ICON, PP, PRG, ONLINE) untuk server Astaga & OKIPAY lengkap dengan hit /hari. |
| **`/supplier`** | **Most Failed Modul** | ⚠️ **Audit Modul Supplier Gagal** (AMC, PCU, MR, MARKAZ, METRO, dll) untuk identifikasi jalur melambat. |
| **`/drop`** | **10 Worst Growth** | 📉 **Daftar 10 Toko/Agen Penurunan Terbesar** (run-rate drop /hari dan % penurunan MTD vs bulan lalu). |
| **`/newmember`** | **New Active Members** | 👥 **Daftar Member Baru Bulan Ini** format `[arid-nama], [cab], total trx` untuk toko yang baru aktif bertransaksi. *(Sumber: `#agen?tab=reseller`)* |
| **`/tiket`** | **Ticket Queue** | 🎫 **Status Antrean Tiket Data Center** (Melihat daftar kebutuhan data yang sedang diracik). |
| **`/help`** | **Help & Guide** | ❓ Panduan lengkap navigasi bot dan petunjuk penggunaan. |

### C. Chatting Bebas, Model Fallback & Aturan Kejujuran (Strict Grounding)

1. **Aturan Karakter & Sapaan**:
   * Sapaan pimpinan: **"Bossque"** (kata *"Juragan"* diblokir permanen).
   * Mode: **Read-Only Data**. Tidak memberikan opini fiktif tanpa data.
   * Format: Bersih untuk layar smartphone, tanpa markdown tebal berlebihan (`***`), tanpa tabel pipa (`|`).

2. **Aturan Kejujuran Mutlak (Zero Hallucination)**:
   * Jika data yang ditanyakan Bossque tidak terdapat di dalam snapshot data resmi server, bot **DILARANG MENGARANG**.
   * Bot merespon santun dan otomatis menerbitkan **Tiket Eskalasi ke Data Center**.

---

## 5. Sistem Tiketing & Eskalasi Data Center (`pages/analisa/tickets/`)

Untuk menjawab kebutuhan analisa mendalam yang belum tercakup di snapshot cepat `data.json`:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. BOSSQUE BERTANYA KE @depas_ai_bot                                   │
│    (Misal: "Berapa tren omset voucher fisik per bulan tahun ini?")     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Data spesifik belum ada di snapshot
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. @depas_ai_bot MENERBITKAN TIKET OTOMATIS:                           │
│    • Bot menghasilkan tag: [[ESKALASI_TIKET: <kebutuhan data>]]        │
│    • Tersimpan di: pages/analisa/tickets/TKT-YYYYMMDD-HHMMSS.json      │
│    • Tercatat di: pages/analisa/tickets/tickets_index.json (PENDING)   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Notifikasi ke Data Center
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. OMPASHA AGENT (@ompasha_bot) BERTINDAK SEBAGAI DATA CENTER:         │
│    • Bro memeriksa tiket via /tiket atau Ompasha membaca tiket         │
│    • Ompasha mengekstrak data dari sumber mentah (XLS/Parquet/DB)      │
│    • Ompasha menyajikan hasil data ke Bro                              │
│    • Tool `resolve_ticket` dijalankan ➔ Status berubah: RESOLVED       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Update snapshot / API Admin
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. DASHBOARD ADMIN & @depas_ai_bot DAPAT MEMBACA DATA TERSEBUT         │
└────────────────────────────────────────────────────────────────────────┘
```

* **Endpoint Web Report Admin**:
  - `GET /api/admin/tickets/list` : Mengambil daftar antrean tiket.
  - `POST /api/admin/tickets/resolve` : Menandai tiket selesai beserta catatan resolusi data.

---

## 6. Detail Teknis Task 4: Ompasha Laptop Dev Agent (`C:\LAPTOP_AGENT`)

Ompasha Laptop Agent adalah AI pengendali teknis laptop dan asisten koding pribadi yang beroperasi langsung di sistem operasi Windows.

* **Lokasi Kerja**: `C:\LAPTOP_AGENT`
* **Bot Telegram**: **`@ompasha_bot`**
* **Sapaan User**: **"Bro"** (santai, sigap, teknis)
* **Karakteristik**: Memiliki akses langsung ke sistem operasi laptop melalui **Gemini Function Calling (Tool Use)**.

### A. Fitur Remote Controller Layanan (100% Silent Mode)
Menyediakan persistent keyboard di Telegram untuk mengontrol server tanpa membuka jendela CMD:
* **`[🚀 Jalankan Web Report]`**: Menjalankan `server.py` (Port 8000) dan `@depas_ai_bot` di background hening.
* **`[🌐 Jalankan Tunnel]`**: Menjalankan Cloudflare Tunnel (`scripts/tunnel.py`) untuk domain publik `https://depas.my.id`.
* **`[📊 Status Laptop & Web]`**: Mengecek kondisi resource laptop (RAM, CPU, port, koneksi).
* **`[🛑 Matikan Layanan]`**: Mematikan proses server dan bot secara bersih.

### B. Gemini Function Calling Tools
1. **`resolve_ticket`**: Menyelesaikan dan memvalidasi tiket eskalasi Data Center dari `@depas_ai_bot`.
2. **`run_command`**: Menjalankan perintah PowerShell di laptop (git, python, npm, taskkill, dll).
3. **`read_file`**: Membaca baris teks isi file proyek.
4. **`write_file`**: Membuat file baru beserta isinya.
5. **`edit_file`**: Mengganti teks/kode di file eksisting (*exact string replacement*).
6. **`list_directory`**: Memeriksa struktur folder dan file di laptop.

---

## 7. Ringkasan File & Direktori Terkait

| File / Direktori | Lokasi | Deskripsi |
| :--- | :--- | :--- |
| `tele_bot.py` | `C:\WEB REPORT\tele_bot.py` | Script Telegram Bot `@depas_ai_bot`, routing menu, analisis Gemini, & pembuat tiket |
| `.env` | `C:\WEB REPORT\.env` | Kredensial rahasia Gemini API Key & Token `@depas_ai_bot` |
| `run_report.bat` | `C:\WEB REPORT\run_report.bat` | Script batch menjalankan Web Report + DepAs Copilot sekaligus |
| `stop_report.bat` | `C:\WEB REPORT\stop_report.bat` | Script batch menghentikan seluruh layanan Web Report & Copilot |
| `run_tunnel.bat` | `C:\WEB REPORT\run_tunnel.bat` | Script batch menyalakan Cloudflare Tunnel `depas.my.id` |
| `scripts/tunnel.py` | `C:\WEB REPORT\scripts\tunnel.py` | Engine Cloudflare Tunnel lokal |
| `pages/analisa/tickets/` | `C:\WEB REPORT\pages\analisa\tickets\` | Direktori penyimpanan file tiket eskalasi Data Center (`TKT-*.json`) |
| `agent.py` | `C:\LAPTOP_AGENT\agent.py` | Script utama Ompasha Laptop Agent (`@ompasha_bot`) & runtime function calling |
| `config.json` | `C:\LAPTOP_AGENT\config.json` | Konfigurasi Token `@ompasha_bot`, multi Gemini API keys, & working dir |
| `start_agent.bat` | `C:\LAPTOP_AGENT\start_agent.bat` | Script batch menjalankan Ompasha Agent di laptop |
| `stop_agent.bat` | `C:\LAPTOP_AGENT\stop_agent.bat` | Script batch menghentikan Ompasha Agent |
| `Daily_Report_ASTAGA_2026-10.png` | `C:\WEB REPORT\` | Visual HD infografis harian My Astaga |
| `Daily_Report_OKIPAY_2026-10.png` | `C:\WEB REPORT\` | Visual HD infografis harian OKIPAY |
| `MASTER/master_data.db` | `C:\WEB REPORT\MASTER\` | Database SQLite berisi `resellers`, `reseller_contacts`, `survey_churn_logs` |

---
*Dokumen ini adalah Single Source of Truth teknis untuk seluruh integrasi AI di ekosistem DepAs (Web Report & Laptop Agent).*
