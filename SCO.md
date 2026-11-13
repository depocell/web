# PEDOMAN STANDAR & DOKUMENTASI LENGKAP SCO SUITE (EXECUTIVE SALES SYSTEM)

Dokumen ini adalah **Single Source of Truth (SOP Wajib)** dan pedoman teknis menyeluruh untuk modul **SCO Executive Suite** (`http://localhost:8000/#sco`) serta repositori live GitHub Pages (`https://depocell.github.io/SCO/`) di ekosistem **Web Report Depo Cell**.
Setiap modifikasi backend engine, pipeline data, maupun tampilan frontend **WAJIB** mematuhi aturan bisnis, formula metrik, dan arsitektur yang tertuang di dokumen ini.

---

## 1. LATAR BELAKANG & TUJUAN BISNIS

### A. Peran Strategis Sales Coordinator (SCO) & Direct Sales Officer (DSO)
* **Sales Coordinator (SCO)** bertindak sebagai ujung tombak operasional lapangan yang membina jaringan konter pulsa dan toko mitra fisik di 4 kantor cabang regional.
* **Direct Sales Officer (DSO)** bertindak sebagai divisi akuisisi mitra baru (New Member) serta penetrasi produk fisik (Voucher Gosok dan Kartu Perdana).
* Modul SCO Suite dibangun untuk menyajikan data performa secara real-time, transparan, objektif, dan adil, sekaligus menghitung pencapaian KPI dan insentif bulanan tanpa bias manual.

### B. Dual-Deployment: Local Web Report & GitHub Pages
1. **Local Web Report (`http://localhost:8000/#sco`)**:
   * Terintegrasi dalam shell utama Web Report menggunakan wrapper iframe (`pages/sco/sco_view.html`).
   * Dilengkapi action bar eksekutif: Tombol Download PNG Resolusi Tinggi (untuk share ke WhatsApp direksi/grup sales) dan Tombol Push ke GitHub.
2. **Public / Mobile SPA (`https://depocell.github.io/SCO/`)**:
   * Beroperasi sebagai Single Page Application (SPA) mandiri tanpa server Python, langsung membaca `data_sco.json` dan `data_reseller.json`.
   * Akses cepat untuk sales lapangan via smartphone.

---

## 2. STRUKTUR TIM & HUKUM PEMETAAN CABANG

Berdasarkan **Hukum Pemetaan Cabang & Tim Sales (SCO)** pada `GEMINI.md`:

### A. Daftar Personel Resmi SCO & DSO
| Tipe | Nama Personel | Wilayah / Cabang Utama | Keterangan |
| :--- | :--- | :--- | :--- |
| **SCO** | **Abdul Harris** | **ICON** | Wilayah binaan cabang ICON |
| **SCO** | **Febri Kurniawan** | **PP** | Wilayah binaan cabang PP |
| **SCO** | **Hupron** | **BSD** | Wilayah binaan cabang BSD |
| **SCO** | **Khoirul Anan** | **PRG** | Wilayah binaan cabang PRG |
| **SCO** | **Mas Komarjaya** | **PP** | Wilayah binaan cabang PP |
| **DSO** | **Ahmad Bukhori** | **Lintas Cabang** | Akuisisi mitra baru & penetrasi fisik |

### B. Aturan Non-Negotiable Cabang & SCO
1. **Cabang ONLINE**:
   * Seluruh agen/reseller yang mendaftar mandiri via Google PlayStore berada di bawah cabang `ONLINE`.
   * **WAJIB memiliki SCO = 'ONLINE'** (DILARANG berstatus `NON SCO`).
2. **Cabang Fisik (`BSD`, `ICON`, `PP`, `PRG`)**:
   * Status **`NON SCO` hanya diperuntukkan** bagi agen di bawah cabang fisik (tipe agen *Walk In* yang datang langsung ke cabang tanpa binaan sales).
   * Cabang fisik dilarang berstatus `ONLINE`, dan cabang `ONLINE` dilarang berstatus `NON SCO`.

---

## 3. HUKUM PERHITUNGAN METRIK & RUN-RATE HARIAN

Berdasarkan ketetapan `GEMINI.md`:

### A. Definisi Transaksi Sukses & Run-rate Harian
* **Hitungan Baris (`COUNTROWS` / Frekuensi Hit)**:
  Total transaksi sukses dihitung murni dari jumlah baris transaksi berstatus sukses. **Dilarang keras menjumlahkan `SUM(qty)`** karena kolom `qty` pada produk saldo/denom bebas berisi nominal rupiah.
* **Pembagi Hari Aktif Global Server**:
  Pembagi run-rate harian adalah jumlah hari kalender server bertransaksi secara global pada bulan bersangkutan (`me.get_active_days(df_m)`). Dilarang membagi berdasarkan hari aktif per-toko atau per-sales.
* **Rumus Resmi Run-rate**:
  $$\text{Daily Trx (Run-rate)} = \frac{\text{Total Trx Sukses (Hits)}}{\text{Jumlah Hari Aktif Cut-off Global}}$$
* **Pertumbuhan MoM (Month-over-Month)**:
  $$\text{Growth Daily (Selisih)} = \text{Daily Bulan Ini} - \text{Daily Bulan Lalu}$$
  $$\text{Growth Daily \%} = \frac{\text{Daily Bulan Ini} - \text{Daily Bulan Lalu}}{\text{Daily Bulan Lalu}} \times 100\%$$

### B. Standar Visualisasi Toko Mati / Churn vs Transaksi Mikro
* **Toko Mati / Churn Murni (Daily Trx = 0)**:
  Toko yang benar-benar tidak memiliki transaksi sukses pada bulan bersangkutan (`v <= 0`) **WAJIB ditampilkan sebagai tanda `(-)` berwarna merah tebal (`.val-dead`)**, BUKAN angka `0,0`.
* **Pencegahan Bias Transaksi Mikro (< 0.1 trx/hari)**:
  Toko yang masih memiliki aktivitas sangat minim (misal 1 transaksi sebulan dengan run-rate 0,03) **dilarang dibulatkan menjadi `0,0`**, melainkan ditampilkan presisi 2 desimal (misal `0,03`). Dengan aturan ini, tim eksekutif dan SCO dapat langsung membedakan secara instan antara toko yang benar-benar mati/churn total (`(-)`) dengan toko yang masih memiliki transaksi sangat kecil.

### C. Hukum Filter Toko Target Kunjungan (PJP) vs Toko Churn Total (#coverage & #detail)
* **Kriteria Inklusi Toko Sasaran PJP**:
  Pada modul `#coverage` (Peta Sebaran) dan `#detail` (Tabel Rute/Performa), sistem hanya menampilkan toko binaan yang memiliki aktivitas transaksi di bulan lalu ATAU bulan ini (`avg_curr > 0 || avg_prev > 0`).
* **Aturan Eliminasi Toko Churn Total**:
  Toko yang pada bulan lalu dan bulan berjalan sama sekali tidak memiliki transaksi (`avg_curr <= 0 && avg_prev <= 0`, contohnya akun `AR20752` yang churn sejak September 2026) **DILARANG DITAMPILKAN** agar rute dan peta PJP tidak dipenuhi titik toko yang sudah non-aktif permanen.
* **Prioritas Toko Sasaran**:
  - **Toko Penyelamatan / Target Visit PJP**: Toko yang bulan lalu bertransaksi namun bulan ini belum/tidak bertransaksi (`avg_prev > 0 && avg_curr == 0`) **WAJIB TETAP MUNCUL** sebagai target utama visitasi SCO.
  - **Toko Reaktivasi**: Toko yang bulan lalu nol transaksi namun bulan ini kembali aktif bertransaksi (`avg_prev == 0 && avg_curr > 0`) **WAJIB MUNCUL** untuk terus dimonitor.

---

## 4. FORMULA KPI & SKEMA INSENTIF

Data target KPI disinkronisasikan dari file master Excel `pages/sco/KPI_SCO.xlsx` oleh `engines/sco_engine.py`:

### A. Skema KPI & Insentif SCO
Evaluasi SCO terdiri dari 4 pilar berbobot:

| Parameter | Bobot | Deskripsi Indikator |
| :--- | :---: | :--- |
| **Visit** | **15%** | Pencapaian kunjungan toko mitra fisik vs jadwal PJP bulanan |
| **Collection** | **25%** | Efektivitas penagihan piutang / pembayaran toko plafon limit |
| **Transaksi** | **35%** | Pencapaian volume Daily Trx aktual vs target bulanan |
| **Growth Trx** | **25%** | Persentase pertumbuhan transaksi toko binaan vs bulan lalu |

* **Formula Skor Akhir SCO**:
  $$\text{Score SCO} = (\% \text{Visit} \times 0.15) + (\% \text{Coll} \times 0.25) + (\% \text{Trx} \times 0.35) + (\text{Growth} \% \times 0.25)$$
* **Insentif SCO**: Diambil dari nominal rupiah hasil komputasi lembar `KPI_SCO` pada Excel.

### B. Skema KPI & Insentif DSO (Ahmad Bukhori)
Evaluasi DSO difokuskan pada perluasan pasar dan produk fisik:

| Parameter | Bobot | Deskripsi Indikator |
| :--- | :---: | :--- |
| **New Member** | **30%** | Jumlah pendaftaran mitra/reseller baru yang aktif bertransaksi |
| **Daily Trx** | **20%** | Pencapaian rata-rata transaksi harian mitra baru |
| **Voucher Fisik** | **30%** | Penjualan voucher gosok (kuota/data fisik) |
| **Kartu Perdana** | **20%** | Penjualan kartu perdana aktivasi |

* **Formula Skor DSO**:
  $$\text{Score DSO} = (\% \text{New Member} \times 0.30) + (\% \text{Daily Trx} \times 0.20) + (\% \text{Voucher} \times 0.30) + (\% \text{Perdana} \times 0.20)$$

* **Tingkat Pengali (Multiplier Tier)**:
  * $\text{Score} \ge 120\% \implies \text{Multiplier} = 120\%$
  * $70\% \le \text{Score} < 120\% \implies \text{Multiplier} = \text{Score}$
  * $60\% \le \text{Score} < 70\% \implies \text{Multiplier} = 50\%$
  * $\text{Score} < 60\% \implies \text{Multiplier} = 0\%$

* **Formula Insentif DSO**:
  $$\text{Insentif DSO} = \left[ (\text{Ach Trx} \times 31) + (\text{Ach Voucher} + \text{Ach Perdana}) \right] \times 50 \times \left(\frac{\text{Multiplier}}{100}\right)$$

### C. Hukum Periode Evaluasi KPI: M-1 (Closed Month Basis)
* Evaluasi pencapaian target dan insentif KPI (baik **KPI SCO** maupun **KPI DSO**) **SECARA BAKU MENGGUNAKAN BASIS M-1 (Bulan Lalu / Full Closed Month)**.
* **Alasan Bisnis**: Indikator performa seperti realisasi kunjungan toko (PJP), efektivitas collection penagihan piutang plafon, serta penjualan voucher/perdana fisik memerlukan rekonsiliasi tutup buku penuh selama 1 bulan kalender utuh.
* **Perilaku Sistem**: Pada saat operasional sistem berada di bulan berjalan (misalnya bulan November), data KPI yang ditampilkan pada modul `#kpi-sco` dan `#kpi-dso` secara sah menyajikan hasil final bulan sebelumnya (Oktober). Master Excel `KPI_SCO.xlsx` diupdate pada awal bulan setelah proses rekonsiliasi selesai.

---

## 5. ARSITEKTUR TEKNIS & PIPELINE DATA (`engines/sco_engine.py`)

Backend komputasi bekerja 100% lokal, cepat, dan mandiri:

```
[OtomaX Raw / TSV]
        │
        ▼
[.cache/trx_astaga_2026.parquet] ──┐
        │                          │
[MASTER/master_data.db] ───────────┼─► [engines/sco_engine.py]
        │                          │         │
[pages/sco/KPI_SCO.xlsx] ──────────┘         ├─► [pages/sco/data_sco.json]
                                             ├─► [pages/sco/data_reseller.json]
                                             │
                                             ▼
                                     [Git Auto-Push]
                                             │
                                             ▼
                                 GitHub: depocell/SCO
                                 (https://depocell.github.io/SCO/)
```

### A. Komponen Backend Utama
1. **`load_master_customers()`**:
   * Membaca tabel `agents` dan `resellers` dari `master_data.db` (atau cache parquet `agen_astaga.parquet` & `reseller_astaga.parquet`).
   * Membangun pemetaan reseller-ke-agen, jadwal kunjungan, limit plafon saldo, dan lokasi GPS toko.
2. **`generate_sco_data()`**:
   * Memfilter transaksi sukses brand ASTAGA (mengecualikan akun internal operasional `AR00037`, `AR00009`, `AR20408`).
   * Menghitung run-rate harian per personel SCO, Non-SCO per cabang, dan Online.
   * Menghasilkan multi-period index (seluruh bulan tahun 2026 terindeks lengkap).
   * Menghitung tren pertumbuhan agen (`tren_agen`) dan run-rate harian kalender (`tren_harian`).
   * Membaca dan mengekstrak matriks insentif `KPI_SCO` dan `KPI_DSO`.
   * Menulis file JSON utama: `pages/sco/data_sco.json`.
3. **`generate_reseller_data()`**:
   * Menganalisis proporsi transaksi per kategori produk (Telco, E-Wallet, PPOB, Token PLN, Voucher Game).
   * Menghitung rasio transaksi `% EWALLET` per reseller untuk mendukung mitigasi fraud gestun.
   * Menulis file JSON: `pages/sco/data_reseller.json`.
4. **`push_to_github()`**:
   * Melakukan checkout/clone lokal ke folder `.cache/sco_git`.
   * Menyinkronkan daftar file rilis (`index.html`, `app.js`, `style.css`, `data_sco.json`, `data_reseller.json`, `KPI_SCO.xlsx`, `leaflet.js`, `leaflet.css`, `html2canvas.min.js`, `logo_myastaga.png`, `unnamed.png`, `dp_icon.png`).
   * Melakukan git commit otomatis dan push branch `main` ke `https://github.com/depocell/SCO.git`.

### B. Endpoint API Server (`server.py`)
* `GET/POST /api/sco/generate`: Memicu kalkulasi ulang data SCO dari transaksi Parquet terbaru.
* `GET/POST /api/sco/push`: Mengeksekusi sinkronisasi file dan push commit ke repositori GitHub Pages.
* `GET/POST /api/sco/check`: Memeriksa apakah `data_sco.json` usang (*stale*) dibandingkan dengan file transaksi atau master Excel.

---

## 6. MODUL FRONTEND SCO SUITE (`pages/sco/`)

Antarmuka frontend menggunakan arsitektur Vanilla JS modern berbasis state reaktif tanpa dependensi framework berat:

### A. Struktur File
```
c:\WEB REPORT\pages\sco\
├── index.html            # Entrypoint utama SPA
├── app.js                # State management, router, dan renderer modul
├── style.css             # Tema modern (Light & Dark Mode)
├── data_sco.json         # Data agregasi transaksi, ranking, & KPI
├── data_reseller.json    # Analisa kategori transaksi & rasio EWALLET
├── KPI_SCO.xlsx          # Master data KPI & formula insentif
├── dp_icon.png           # Aset visual icon brand SCO Suite
├── logo_myastaga.png     # Logo resmi brand MyAstaga
├── unnamed.png           # Logo alternatif / watermark
├── leaflet.js & .css     # Library GIS pemetaan area konter
└── html2canvas.min.js    # Engine screenshot render canvas HD
```

### B. Tampilan Tab / Menu Utama (`app.js`)
1. **`#ringkasan` (Ringkasan Performa)**:
   * Matriks Run-rate Harian seluruh personel SCO vs Non-SCO vs Cabang Online.
   * Perbandingan MoM (*Previous Month vs Current Cutoff*).
   * Grafik visual tren harian sepanjang bulan berjalan.
2. **`#coverage` (Area Coverage & Geotagging)**:
   * Peta interaktif Leaflet menampilkan sebaran konter/toko agen binaan aktif.
   * Pengelompokan warna pin berdasarkan personel SCO dan status limit/non-limit.
   * Hanya memetakan toko target aktif (`avg_curr > 0 || avg_prev > 0`), mengecualikan toko churn total.
   * **Fitur "Kirim Target PJP ke WA"**: Tombol eksekutif untuk menyalin daftar toko target kunjungan ke clipboard yang dikelompokkan rapi per jadwal hari (`SENIN-KAMIS`, `SELASA-JUMAT`, `RABU-SABTU`) dengan format siap paste ke WhatsApp:
     ```text
     Jadwal : SENIN-KAMIS
     ARXXXX-NAMANYA
     ARYYYY-NAMANYA

     Jadwal : SELASA-JUMAT
     ...
     ```
3. **`#profil-agen` (Profil & Tren Toko Mitra)**:
   * Tabel komprehensif performa per-toko: Rata-rata transaksi, tren MoM, limit saldo, jadwal rute kunjungan, dan lokasi.
   * Fitur pencarian instan dan filter multi-kriteria (Cabang, SCO, Tipe Toko).
4. **`#detail` (Performa MTD & Detil Reseller)**:
   * Analisis breakdown transaksi per produk dan kontribusi per reseller downline.
5. **`#kpi-sco` (KPI & Insentif SCO)**:
   * Dashboard pencapaian target Visit, Collection, Trx, Growth, beserta kalkulasi skor dan estimasi insentif rupiah. Filter bulan secara default langsung menampilkan bulan evaluasi terakhir (M-1).
6. **`#kpi-dso` (KPI & Insentif DSO)**:
   * Dashboard pencapaian target Ahmad Bukhori (New Member, Daily Trx, Voucher, Perdana) beserta tabel tiering multiplier. Filter bulan secara default langsung menampilkan bulan evaluasi terakhir (M-1).
7. **`#settings` (Pengaturan & Sinkronisasi)**:
   * Panel info status data, waktu generate, status cutoff data, dan tombol trigger refresh/push.

---

## 7. FITUR EKSEKUTIF PADA WEB REPORT (`#sco`)

Pada navigasi utama Web Report (`http://localhost:8000/#sco`), modul SCO dibungkus melalui `pages/sco/sco_view.html` dengan fitur tambahan:

1. **Tombol Download PNG (WhatsApp)**:
   * Menggunakan `html2canvas` untuk menangkap tampilan dashboard secara presisi (skala 2x, background disesuaikan tema terang/gelap).
   * Menghasilkan file gambar siap sebar dengan nama `Laporan_SCO_YYYY-MM-DD.png`.
2. **Tombol Push ke GitHub**:
   * Memanggil API `/api/sco/push` secara asynchronous dengan banner progres visual.
   * Memberikan konfirmasi sukses dan tautan langsung ke web live GitHub Pages.
3. **Tombol Live GitHub**:
   * Membuka langsung `https://depocell.github.io/SCO/` di tab baru.
4. **Tombol Preview**:
   * Membuka versi fullscreen `./pages/sco/index.html` di tab baru.

---

## 8. PANDUAN PEMELIHARAAN & TROUBLESHOOTING

1. **Jika Transaksi Bulan Baru Belum Muncul**:
   * Pastikan file TSV transaksi terbaru telah diimpor ke Parquet melalui menu Admin Data (`#admin`) atau auto-sync harian.
   * Jalankan trigger re-kalkulasi via API:
     ```powershell
     Invoke-RestMethod -Uri "http://localhost:8000/api/sco/generate" -Method POST
     ```
2. **Jika Target / Personel SCO Berubah**:
   * Perbarui lembar kerja `KPI_SCO` atau `KPI_DSO` pada file `pages/sco/KPI_SCO.xlsx`.
   * Jika ada penambahan nama sales baru, daftarkan pasangan `(Nama, Cabang)` pada konstanta `SCO_PERSONNEL` di `engines/sco_engine.py`.
   * Trigger kembali generate data agar `data_sco.json` diperbarui.
3. **Penyelarasan Aset Gambar & File Push**:
   * Jika ada aset gambar baru yang ditambahkan ke `pages/sco/`, wajib mendaftarkan nama filenya ke dalam list `files_to_sync` pada fungsi `push_to_github()` di `engines/sco_engine.py` agar ikut terunggah ke repositori GitHub Pages.

---
*Dokumen ini dibuat dan dipelihara sebagai standar baku arsitektur modul SCO Suite Web Report Depo Cell.*
