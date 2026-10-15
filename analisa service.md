# 📊 Dokumentasi & Spesifikasi Analisa Service Depo Cell

> **Dokumen Resmi Arsitektur & Evaluasi SLA Layanan & Supplier**  
> *Lokasi Modul:*  
> - `http://localhost:8000/#analisa?tab=service` (Analisa Service & Kualitas Produk)  
> - `http://localhost:8000/#analisa?tab=supplier` (Analisa Supplier & Modem Pool SLA)  
> *Versi Rilis:* Oktober 2026 (Live Gold Analytics)

---

## 1. Ringkasan & Struktur Tab

Fitur Analisa Layanan dipecah menjadi dua sub-tab terdedikasi agar manajemen & tim operasional memiliki fokus visual yang jelas:

1. **Analisa Service (`#analisa?tab=service`):**
   - **Kualitas Sukses Layanan:** Memantau persentase sukses per hari/bulan/tahun.
   - **Kecepatan Eksekusi (Speed Telemetry):** Mengukur durasi transaksi sukses secara riil dari Parquet.
   - **Tren Penjualan Kategori:** Memantau dinamika volume kategori produk.
   - **Filter Hirarki Master Produk:** Kategori, Operator, dan Tipe Produk.

2. **Analisa Supplier (`#analisa?tab=supplier`):**
   - **Mini KPI Kesehatan Supplier:** Total Modul, Status Baik, Status Cukup, dan Status Kurang.
   - **Deteksi Dini Kendala Modul (Top Issue Radar):** 🚨 Top 3 Modul Sering Gagal & ⏱️ Top 3 Modul Paling Lemot (disertai badge operator dominan).
   - **Evaluasi SLA Supplier & Modem Pool:** Tabel Scorecard lengkap dengan kolom Operator, filter H2H vs CHIP, dan search box instan.

---

## 2. Arsitektur Data & Sumber Informasi

```
┌─────────────────────────────────┐       ┌───────────────────────────────────┐
│ C:\RAW DATA\PRODUCT_ASTAGA.xlsx │       │ .cache/trx_*_2026.parquet         │
│ Sheet: Modul (CHIP vs H2H)      │       │ Kolom: modul_id, tgl_entry, stat  │
└────────────────┬────────────────┘       └─────────────────┬─────────────────┘
                 │                                          │
                 ▼                                          ▼
┌─────────────────────────────────┐       ┌───────────────────────────────────┐
│ MASTER/master_data.db (SQLite)  │──────▶│ engines/analisa_engine.py         │
│ Tabel: modules                  │       │ Pre-aggregation ke Gold Cache     │
└─────────────────────────────────┘       └─────────────────┬─────────────────┘
                                                            │
                                                            ▼
                                          ┌───────────────────────────────────┐
                                          │ .cache/analisa_gold_2026.json     │
                                          │ Response API < 20 ms              │
                                          └─────────────────┬─────────────────┘
                                                            │
                                                            ▼
                                          ┌───────────────────────────────────┐
                                          │ UI pages/analisa/index.html & js  │
                                          │ Top Issue Cards + Scorecard Table │
                                          └───────────────────────────────────┘
```

### A. Tabel SQLite Master Modul (`MASTER/master_data.db`)
Mapping jenis modul disimpan secara terpusat pada tabel `modules`:
- **ASTAGA:** 41 modul (16 `CHIP` modem pool internal seperti `CSK-MO2`, `CSK-MO3` & 25 `H2H` supplier luar seperti `PCU`, `AMC`, `MR`, `SMB`).
- **OKIPAY:** 11 modul (100% `H2H` jalur agregator seperti `DIGIFLAZZ`, `MORA`, `METRO`, `TAMA`, `CEBONG`, `MARKAZ`, `CENTRA`, `BIKHOIR`).

### B. Ekstraksi Metrik dari Parquet 2026
Data dihitung langsung dari log transaksi aktual:
- `trx` = Total percobaan transaksi yang masuk ke modul tersebut.
- `sukses` = Total transaksi dengan status mengandung kata `sukses`.
- `gagal` = Total transaksi dengan status gagal/reject/timeout (`trx - sukses`).
- `sukses_pct` = Persentase keberhasilan `(sukses / trx) * 100%`.
- `avg_speed` = Rata-rata durasi detik `(tgl_stat - tgl_entry)` **hanya untuk transaksi sukses**.

---

## 3. Komponen Visualisasi Utama

### A. Chart Full-Width (Memanjang)
1. **📈 Tren Kualitas Sukses Layanan (% Sukses Rate):**
   - Menampilkan persentase keberhasilan per hari/bulan.
   - Garis batas SLA acuan target: **≥ 98%**.
2. **⏱️ Tren Rata-rata Durasi Kecepatan Transaksi (Sukses Only):**
   - Menampilkan rata-rata durasi dalam satuan detik.
   - Format waktu disandingkan dengan `mm:ss` (misal `00:15` atau `02:21`).

### B. Filter Hirarki Master Produk
Terletak tepat di bawah filter utama (Brand, Tahun, Bulan):
- **Kategori (Pills):** `SEMUA`, `EWALLET`, `TELCO`, `PLN`, `PPOB`, `GAME`.
- **Operator (Dropdown):** Menyesuaikan otomatis dengan kategori yang dipilih (misal TELCO &rarr; TELKOMSEL, INDOSAT, XL, AXIS, SMARTFREN).
- **Tipe / Paket (Dropdown):** Filter tipe produk reguler, data, paket nelpon, dll.

---

## 4. Evaluasi Kesehatan Modul & Supplier SLA

### A. Quadrant / Kartu Peringatan (Top Issue)
Ditempatkan tepat di atas tabel scorecard agar manajemen langsung melihat isu utama dalam 3 detik pertama:

1. **🚨 Top 3 Modul Paling Sering Gagal:**
   - **Kriteria Sorting:** Kuantitas `Gagal` terbanyak descending, lalu `% Sukses` terendah.
   - **Informasi:** Peringkat (`#1, #2, #3`), Nama Modul, Badge Jalur (`CHIP` vs `H2H`), Badge Status SLA, Qty Gagal (merah tebal), dan % Sukses.
   - **Manfaat:** Mengidentifikasi jalur supplier yang paling banyak membuang modal, memicu komplain agen, atau kehabisan stok saldo supplier.

2. **⏱️ Top 3 Modul Paling Lemot:**
   - **Kriteria Sorting:** `Avg Speed (Detik)` tertinggi descending pada transaksi sukses (min 5 trx).
   - **Informasi:** Peringkat (`#1, #2, #3`), Nama Modul, Badge Jalur, Badge Status SLA, Avg Speed (detik & `mm:ss`), dan Total Transaksi.
   - **Manfaat:** Mengidentifikasi modem pool yang antreannya macet (*overload* atau gangguan sinyal) atau supplier H2H yang mengalami *latency* tinggi.

---

### B. Tabel Evaluasi Supplier / Modul
Tabel interaktif lengkap dengan 10 kolom standar:

| Kolom | Tipe Data | Format / Tampilan | Penjelasan |
| :--- | :---: | :---: | :--- |
| **No** | Angka | Center | Nomor urut baris |
| **Nama Modul** | Teks | Bold Heading | Nama jalur modul (disertai raw ID jika berbeda) |
| **Tipe** | Badge | Pill Center | `CHIP` (Ungu) atau `H2H` (Biru) |
| **Operator** | Badge | Pill Center | Operator dominan yang dilayani modul (misal `TELKOMSEL`, `XL - AXIS`, `TOKEN PLN`) |
| **Total Trx** | Angka | Right (Mono) | Total percobaan transaksi yang dialihkan ke modul |
| **Sukses** | Angka | Right (Mono Hijau) | Kuantitas transaksi yang sukses |
| **Gagal** | Angka | Right (Mono Merah) | Kuantitas transaksi yang gagal |
| **% Sukses** | Persentase | Right (Mono Tebal) | Rasio keberhasilan transaksi (`sukses / total * 100`) |
| **Avg Speed** | Detik | Right (Mono) | Rata-rata durasi waktu selesai (`detik` + format `mm:ss`) |
| **Status Kesehatan** | Badge | Pill Center | Klasifikasi kesehatan performa SLA (`BAIK`, `CUKUP`, `KURANG`) |

---

### C. Formula Klasifikasi Status Kesehatan SLA

Klasifikasi bersifat mutually exclusive dengan prioritas evaluasi ketat:

```python
if sukses_pct < 95.0 or avg_speed > 30.0:
    status = "KURANG"    # 🔴 Perlu Tindakan / Evaluasi Mendesak
elif sukses_pct >= 98.0 and avg_speed < 15.0:
    status = "BAIK"      # 🟢 Performa Optimal (SLA Terpenuhi)
else:
    status = "CUKUP"     # 🟡 Waspada / Pemantauan Operasional
```

#### Rincian Kriteria & Definisi:
- 🟢 **BAIK (Performa Optimal):**
  - **Syarat:** Sukses Rate $\ge 98.0\%$ **DAN** Avg Speed $< 15.0$ detik.
  - **Arti:** Modul beroperasi dalam kapasitas terbaik, cepat, dan handal. Sangat aman diposisikan sebagai *Priority 1* pada routing transaksi.
- 🟡 **CUKUP (Waspada / Perhatian Operasional):**
  - **Syarat:** Sukses Rate $95.0\% - 97.9\%$ **ATAU** Avg Speed $15.0 - 30.0$ detik (tanpa melanggar batas merah).
  - **Arti:** Mulai terjadi penurunan performa atau antrean melambat. Perlu dipantau sisa saldo supplier atau utilitas port modem pool.
- 🔴 **KURANG (Perlu Tindakan / Evaluasi):**
  - **Syarat:** Sukses Rate $< 95.0\%$ **ATAU** Avg Speed $> 30.0$ detik.
  - **Arti:** Jalur modul dinilai di bawah standar SLA toleransi. Rekomendasi: Turunkan prioritas routing (*failover*), hubungi CS supplier H2H, atau lakukan restart/cek fisik kartu pada modem pool.

---

### D. Fitur Interaktif pada Tabel Scorecard
1. **Filter Tab Pills Jalur:**
   - `Semua Modul`: Menampilkan seluruh modul terdaftar.
   - `H2H (Supplier)`: Menyaring modul jalur supplier pihak ketiga.
   - `CHIP (Modem Pool)`: Menyaring modul modem pool internal server.
2. **Pencarian Real-Time (*Search Box*):**
   - User dapat mengetik nama modul apa pun (misal `AMC`, `CSK`, `METRO`) dan tabel langsung terfilter secara instan tanpa memuat ulang halaman.
3. **Sinkronisasi Otomatis:**
   - Ketika user mengganti filter Brand (`ASTAGA` / `OKIPAY` / `SEMUA`) atau Bulan di kontrol atas, seluruh tabel dan kartu peringatan otomatis memperbarui kalkulasinya.

---

## 5. Ringkasan File & Source Code Terkait

| File | Peran & Modifikasi |
| :--- | :--- |
| [MASTER/master_data.db](file:///c:/WEB%20REPORT/MASTER/master_data.db) | Database SQLite penyimpan tabel `modules` (`brand`, `modul_id`, `tipe_modul`). |
| [engines/master_product_engine.py](file:///c:/WEB%20REPORT/engines/master_product_engine.py) | Helper `get_module_type_map(brand)` untuk membaca relasi CHIP vs H2H. |
| [engines/analisa_engine.py](file:///c:/WEB%20REPORT/engines/analisa_engine.py) | Menghitung `modules` per bulan di `_build_2026_from_parquet()`, agregasi scorecard di `_aggregate_modules_scorecard()`, dan mengekspos payload ke API `/api/analisa/data`. |
| [pages/analisa/index.html](file:///c:/WEB%20REPORT/pages/analisa/index.html) | Markup kontainer `#section-analisa-service`: Kartu Top 3 Gagal, Kartu Top 3 Lemot, dan Tabel Scorecard. |
| [pages/analisa/analisa.js](file:///c:/WEB%20REPORT/pages/analisa/analisa.js) | Logika render UI: `renderServModuleEvaluation()`, `renderTopFailingModules()`, `renderTopSlowestModules()`, `renderModuleScorecardTable()`, filter tipe & pencarian modul. |
---

## 6. Integrasi Telemetri Dinamis Filter Produk (Kategori, Operator, Tipe)

Ketika pengguna memilih salah satu opsi pada filter Master Produk (Kategori, Operator, atau Tipe), seluruh metrik layanan berikut otomatis terkalkulasi ulang secara dinamis (*real-time reactive*) dari data telemetri transaksi Parquet:

1. **Kartu KPI Layanan Terfilter:**
   - **Success Rate Layanan (`#serv-stat-sukses`):** Menampilkan tingkat keberhasilan aktual produk/kategori terpilih.
   - **Avg Durasi Kecepatan (`#serv-stat-durasi`):** Menghitung rata-rata kecepatan eksekusi sukses (`tgl_stat - tgl_entry`) khusus untuk produk/kategori yang difilter.
   - **Volume Transaksi Terfilter (`#serv-stat-total`):** Total volume transaksi yang sesuai dengan filter produk.
2. **Grafik Tren Harian & Bulanan Layanan:**
   - **Chart Tren Kualitas Sukses Layanan:** Garis persentase sukses per hari/bulan mengikuti produk terpilih.
   - **Chart Tren Rata-rata Durasi Kecepatan:** Garis kecepatan rata-rata harian/bulanan mengikuti produk terpilih.
3. **Pie Chart Status Transaksi:**
   - Proporsi sukses vs reject provider/nomor/saldo menyesuaikan dengan performa produk terpilih.

### Benchmark Riil Data Parquet (Contoh Oktober 2026):
| Kategori Filter | Sukses Rate | Avg Speed (Detik) | Karakteristik Layanan |
| :--- | :---: | :---: | :--- |
| **PLN** | **99.1%** | **00:08** (8.0s) | Sangat prima dan cepat |
| **PPOB** | **99.7%** | **00:03** (2.6s) | Kualitas terbaik, respon kilat |
| **EWALLET** | **98.5%** | **00:24** (24.0s) | Stabil di atas standar SLA |
| **TELCO** | **94.1%** | **00:20** (20.0s) | Waspada karena fluktuasi sinyal |
| **GAME** | **89.2%** | **00:29** (29.0s) | 🔴 Gangguan/Isu SLA voucher game |

---

*Depo Cell Reporting System • Dokumen diperbarui otomatis pada 10 Oktober 2026*
