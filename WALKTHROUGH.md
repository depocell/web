# 🚀 WALKTHROUGH & STATUS PROYEK: WEB REPORT BI

Dokumen ini adalah rekam jejak resmi status pengerjaan dan **STANDAR ACUAN (GUIDELINES)** sistem **WEB REPORT (`c:\WEB REPORT`)** per **08 Oktober 2026**. 

Semua agen / sesi AI **WAJIB** membaca dan mengikuti standar arsitektur, UI/typography, dan alur kerja di dokumen ini agar pengerjaan antar modul tetap seragam, konsisten, dan bebas konflik.

---

## 📌 DAFTAR MODUL & STATUS PENGERJAAN

### A. MENU UTAMA
| Modul | Halaman / Hash | Status | Deskripsi Singkat |
| :--- | :--- | :---: | :--- |
| **Admin Data & Master Hub** | `#admin` | **DONE** ✅ | Ingestion radar & conditional upsert TSV OtomaX (auto-backup, takeout harga 0, takeout AR00037 ASTAGA, whitelist OP00037 OKIPAY). **Master Agen & Reseller** via SQLite `master_data.db` (hierarki MLM 28k+ downline, 4 kolom baru: Limit Saldo, Markup, Tgl Daftar, Tgl Aktivitas Terakhir, fitur `+ Tambah Agen`, edit propagasi cabang, export Excel). **Master Produk & Kategori** (composite PK `(brand, kode_produk)` isolasi 395 SKU kembar, 3.579 SKU ASTAGA, 2.193 SKU OKIPAY, fitur `+ Tambah Produk`, live edit, sync Parquet & RAM). |
| **Overview Dashboard** | `#overview` | **DONE** ✅ | Tren perbandingan harian cabang, ringkasan brand, dan Audit Master widget otomatis. |
| **Daily Summary Report** | `#daily` | **DONE** ✅ | Laporan harian performa cabang & produk, grafik Chart.js berlabel angka, tombol Download PNG HD. |
| **SCO Executive Suite** | `#sco` | **DONE** ✅ | Portal SCO, auto-generate Parquet ke JSON, auto-push ke GitHub Pages (`depocell/SCO`). |
| **Agen & Reseller** | `#reseller` & `#agen` | **DONE** ✅ | Profil customer, rollup downline Agen Induk, komposisi produk, % EWALLET, tracking Retensi vs Churn ASTAGA, Filter Cabang, dan Export Excel `.xlsx`. |
| **Produk Fisik & DSO** | `#produk` | **DONE** ✅ | Penjualan produk fisik (Voucher Fisik & Perdana) dan performa sales DSO dari rekapan SISCOM (`.ttx`). |

### B. ANALISA
| Modul | Halaman / Hash | Status | Deskripsi Singkat |
| :--- | :--- | :---: | :--- |
| **Dashboard Analisa (Chart Only)** | `#analisa` | **DONE** ✅ | Visualisasi grafis analitikal lengkap 2023-2026 bulanan dengan filter pills (Brand, Tahun, Bulan) tanpa tabel. 3 sub-analisa: **Distribusi** (relasi trx & customer), **Service** (relasi trx & produk), dan **Lain-Lain** (peak hours & status). |
| ↳ *Analisa Distribusi* | `#analisa-distribusi` | **DONE** ✅ | Relasi volume transaksi bulanan & customer aktif 2023-2026, performa cabang, produktivitas TPM, segmentasi retensi/churn. |
| ↳ *Analisa Service* | `#analisa-service` | **DONE** ✅ | Relasi transaksi & produk, tren penjualan multi-kategori (Telco, EWALLET, PLN, dll), komposisi share %, kualitas success rate. |
| ↳ *Analisa Lain Lain* | `#analisa-lain` | **DONE** ✅ | Pola jam sibuk transaksi (hourly 00:00-23:00), status breakdown, distribusi hari mingguan. |
| **Pivot Transaksi Dinamis** | `#transaksi` | **DONE** ✅ | Analisa multidimensi fleksibel (Cabang, Bulan, Channel, Produk, Status) + Export Excel `.xlsx` multi-format. |

---

## 📊 STANDAR KHUSUS DASHBOARD ANALISA (CHART ONLY)
Sesuai arahan resmi per 06 Oktober 2026:
1. **Zero Table (Tanpa Tabel)**: Halaman analisa tidak boleh memuat elemen tabel (`<table>`). Tampilan 100% berbasis visualisasi grafik (Chart.js) dan KPI card.
2. **Cakupan Multi-Tahun (2023 s/d Bulan Terakhir)**: Menampilkan tren bulanan jangka panjang (2023 s/d 2026 bulan berjalan).
3. **Agregasi Level Bulanan**: Cukup data agregasi bulanan per titik (bukan data harian mikroskopik).
4. **Filter Interaktif Menggunakan Pills**: Filter hanya menggunakan tombol kapsul (Pills) untuk **Brand** (`ASTAGA`, `OKIPAY`, `SEMUA`), **Tahun** (`ALL`, `2023`, `2024`, `2025`, `2026`), dan **Bulan** (`ALL`, `Jan` s/d `Des`).
5. **Keseragaman Font (Google Typography Stack)**:
   - Judul & Heading: `var(--font-heading)` (`'Plus Jakarta Sans'`)
   - Deskripsi & Label: `var(--font-sans)` (`'Roboto'`)
   - Angka & Metrik: `var(--font-mono)` (`'Roboto Mono'`)

---

## 🎨 STANDAR UI & TYPOGRAPHY RESMI (GOOGLE AESTHETICS)

Untuk menjaga konsistensi visual di seluruh modul, semua agen **WAJIB** mematuhi standar desain berikut:

### 1. Typography Stack (Material & Google Workspace Feel)
Sistem menggunakan kombinasi font resmi Google:
* **Body / Isi Tabel / Paragraf:** `'Roboto', -apple-system, sans-serif`  
  *Gunakan variable CSS `var(--font-sans)`.* Font standar Google yang ramping, sangat jelas, dan nyaman dibaca pada data padat.
* **Judul / Heading / Menu:** `'Plus Jakarta Sans', 'Google Sans', sans-serif`  
  *Gunakan variable CSS `var(--font-heading)`.* Font geometrik modern yang memberikan aura ramah dan premium khas Google Workspace.
* **Angka / Monospace / Kode / Limit:** `'Roboto Mono', monospace`  
  *Gunakan variable CSS `var(--font-mono)` atau class `.font-mono`, `td.num`.* Menjaga angka ribuan dan Rupiah sejajar secara tabular.

### 2. Pola Desain Tabel: "Stacked 2 Lantai" (Two-Line Cell)
Hindari membuat 10–15 kolom terpisah yang membuat tabel melebar horizontal. Gunakan pola sel 2 lantai:
* **Lantai Atas (Primary):** Data kunci, tebal (bold 700), font-size 13–13.5px (contoh: ID Reseller `AR08869`, Badge Cabang, Nama Jadwal).
* **Lantai Bawah (Secondary):** Konteks pelengkap, subtle/muted (`color: var(--text-muted)`), font-size 11–11.5px (contoh: Nama Toko, Nama SCO, Nilai Limit).

### 3. Pola "Inline Micro-Badges" Komposisi Produk
Untuk menampilkan breakdown kategori transaksi dalam satu sel horizontal:
* `EW` (E-Wallet): Biru (`#1d4ed8`, bg `rgba(29, 78, 216, 0.08)`)
* `TEL` (Telco): Hijau (`#15803d`, bg `rgba(21, 128, 61, 0.08)`)
* `PLN` (Token Listrik): Ungu (`#7e22ce`, bg `rgba(126, 34, 206, 0.08)`)
* `PP` (PPOB): Oranye/Cokelat (`#a16207`, bg `rgba(161, 98, 7, 0.08)`)
* `GM` (Game): Merah (`#b91c1c`, bg `rgba(185, 28, 28, 0.08)`)
* `STK` (Transfer Stok): Abu-abu (`#475569`, bg `rgba(71, 85, 105, 0.08)`)

### 4. Ekspor Dokumen
* Utamakan ekspor langsung ke **Microsoft Excel (`.xlsx`)** menggunakan library lokal `static/js/xlsx.full.min.js`.
* Setiap tombol export Excel diberi ikon SVG hijau + badge `.XLSX`.
* Format sel numerik harus ter-encode dengan benar (`#,##0` untuk rupiah/integer, `0.0%` untuk persentase) dengan auto-width kolom.

---

## 🏗️ ARSITEKTUR MULTI-AGEN & PANDUAN KOLABORASI

Pengerjaan sistem ini menggunakan pola **Multi-Chat / Modular Task Isolation**. Untuk mencegah konflik (*conflict prevention*):

### 1. Struktur Modul Mandiri (Self-Contained)
Setiap modul baru ditempatkan di foldernya sendiri:
* Halaman & Frontend JS: `pages/<nama_modul>/index.html` dan `pages/<nama_modul>/<nama_modul>.js`
* Backend Komputasi: `engines/<nama_modul>_engine.py`

### 2. Titik Temu Bersama (Central Touchpoints)
Hanya ada 2 file sentral yang menghubungkan modul dengan aplikasi utama:
1. **`server.py`**:
   * Tambahkan route baru: `Route("/api/<modul>", api_<modul>)`.
   * Hindari mengubah atau menimpa route lama.
   * Gunakan `importlib.reload(...)` jika modul membutuhkan dynamic reload saat development.
2. **`templates/shell.html` & `static/js/app.js`**:
   * Tambahkan entri navigasi di `#sidebar` `templates/shell.html`.
   * Daftarkan route hash di objek `ROUTES` pada `static/js/app.js`.

### 3. Master Data Terpusat (SQLite + Parquet Hub)
* Master Customer dan Master Produk resmi kini terpusat di satu database relasional `MASTER/master_data.db` (SQLite) dan di-cache dalam format Parquet (`.cache/cust_*.parquet`, `.cache/prod_*.parquet`).
* Seluruh engine analitikal membaca langsung dari Parquet/SQLite tanpa ketergantungan pada file Excel manual (`CUSTOMER_ASTAGA.xlsx`, `CUSTOMER_OKI.xlsx`, `PRODUCT_ASTAGA.xlsx`, `PRODUCT_OKI.xlsx`). File Excel lama berstatus arsip pasif / backup.
* Pembaruan data customer dan produk dilakukan langsung melalui antarmuka Web Admin (`#admin`), yang secara otomatis memvalidasi hierarki pohon MLM, mempropagasi perubahan cabang ke downline, menyelaraskan pemetaan kategori/operator produk, dan memperbarui Parquet Cache & RAM Engine secara realtime.

### 4. Peran Chat Utama (Control Room)
* Chat utama bertindak sebagai **Integrator / Quality Control**.
* Chat utama bertanggung jawab melakukan audit conflict, verifikasi integritas sistem menyeluruh, dan eksekusi commit & push (`sundul`) ke repository GitHub.

---

## 🛠️ STATUS IMPLEMENTASI BACKEND CORE

1. **Incremental Cache Builder (`engines/transaction_engine.py`)**: Partisi bulanan di `.cache/parts/`, freeze bulan lama, boot time < 50ms via in-memory RAM cache.
2. **Reseller Engine (`engines/reseller_engine.py`)**: Analisa profil, segmentasi keaktifan (Aktif Rutin, Baru, Churn), % EWALLET, cabang, jadwal, limit.
3. **Agen Induk Engine (`engines/agen_engine.py`)**: Agregasi performa reseller ke Agen Induk, ranking produktivitas agen, filtering cabang.
4. **Fisik & DSO Engine (`engines/fisik_engine.py`)**: Parsing rekapan penjualan fisik (.ttx) dan evaluasi performa DSO.
5. **SCO Suite Engine (`engines/sco_engine.py`)**: Ekstraksi presisi 51 baris KPI SCO dari sheet `KPI_SCO` (bukan DSO), export `data_sco.json` dan `data_reseller.json`.
6. **Pivot Engine (`engines/pivot_engine.py`)**: Agregasi transaksi multidimensi super cepat dengan cache terisolasi `cust_full_{brand}.parquet` dan `prod_full_{brand}.parquet`.
7. **Master Data Hub (`engines/master_data_engine.py`)**: Database terpusat `MASTER/master_data.db` (SQLite) + Parquet cache (`cust_astaga.parquet` & `cust_okipay.parquet`). Menyelesaikan hierarki pohon MLM 28.460 reseller dalam 0.63s, mengelola mapping Agen Induk, SCO/DSO, jadwal, dan auto-propagasi cabang ke seluruh downline secara instan. Fitur ekspor Excel resmi langsung dari database.
8. **Master Product Engine (`engines/master_product_engine.py`)**: Database master produk di `MASTER/master_data.db` (tabel `products` dengan composite PK `(brand, kode_produk)`). Menampung 3.579 SKU ASTAGA dan 2.193 SKU OKIPAY tanpa konflik 395 kode identik. Menyediakan full text search, filter kategori/operator/paket, editor live via Web Admin, auto-sync ke `.cache/prod_*.parquet`, dan zero Excel dependency pada `product_engine.py` & `pivot_engine.py`.
9. **Admin Ingestion Engine (`engines/admin_engine.py`)**: Radar monitoring file TSV OtomaX harian di `C:\RAW DATA`, conditional upsert (filtering zero price, takeout internal AR00037, whitelist OP00037), auto-backup `.xlsx.bak`, auto-rebuild Parquet cache bulanan & tahunan secara bertahap di thread background.

---

## 🌙 ROADMAP SINKRONISASI MALAM HARI (MULTI-AGEN COLLABORATION)

Fokus integrasi antar-agen di tiap halaman (`pages/*`) agar alurnya 100% konsisten dengan arsitektur baru:
1. **Zero Excel Dependency**: Pastikan seluruh controller JS dan backend engine halaman (`#daily`, `#sco`, `#reseller`, `#agen`, `#transaksi`, `#analisa`) mengambil data dari Parquet Cache / SQLite, bukan membaca ulang Excel mentah.
2. **Kesesuaian 4 Kolom Baru**: Pemanfaatan kolom `limit_saldo`, `markup`, `tgl_daftar`, dan `tgl_aktivitas_terakhir` di modul Reseller & Agen.
3. **Kesesuaian Kategori Produk Baru**: Pastikan filter dropdown kategori & operator di seluruh halaman analitikal mencocokkan taksonomi resmi dari tabel `products`.
4. **Verifikasi Responsifitas & Kecepatan**: Semua endpoint API halaman wajib merespons di bawah 50ms berkat hierarki cache RAM & Parquet.

---

## 🏃 CARA MENJALANKAN SISTEM (LOCAL)

Server dijalankan secara manual oleh pengguna di terminal mandiri (agar tidak membebani proses background):

```powershell
cd "C:\WEB REPORT"
python server.py
```

Akses dashboard: **`http://localhost:8000`**

---

*Terakhir diperbarui: 08 Oktober 2026 (Penyelesaian Modul Admin Data & Master Hub) — Tim Arsitektur & IT Management WEB REPORT.*
