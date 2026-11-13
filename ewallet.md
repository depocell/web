# 💳 PEDOMAN STANDAR & DOKUMENTASI LENGKAP FITUR E-WALLET MONITORING (FRAUD & TREN)

Dokumen ini adalah **Single Source of Truth (SOP Wajib)** dan pedoman teknis menyeluruh untuk modul **E-Wallet Monitoring** (`http://localhost:8000/#ewallet`) di ekosistem **Web Report Depo Cell**.
Setiap modifikasi backend engine, pipeline data, dan tampilan frontend **WAJIB** mematuhi aturan bisnis dan arsitektur yang tertuang di dokumen ini.

---

## 1. LATAR BELAKANG & TUJUAN BISNIS

### A. Ancaman Fraud Gestun (Gesek Tunai / Tarik Tunai Saldo Plafon)
* Beberapa toko mitra yang memiliki fasilitas kredit/plafon limit saldo menggunakan produk E-Wallet (DANA, OVO, GoPay, ShopeePay, LinkAja, Maxim, dsb.) bukan untuk melayani pelanggan riil, melainkan untuk **menembak ke nomor akun e-wallet milik toko itu sendiri** (*Self-Transaction*).
* Praktik ini berisiko tinggi mencairkan dana talangan server menjadi kas pribadi (*gestun*) tanpa adanya perputaran ritel pulsa yang sehat, meningkatkan risiko gagal bayar (*bad debt*).

### B. Keputusan Eliminasi Brand OKIPAY
* Seluruh agen/reseller pada brand **OKIPAY adalah akun Cash/Prima murni** (tidak memiliki fasilitas limit saldo/plafon kredit).
* Oleh karena itu, modul E-Wallet Monitoring **DIKUNCI 100% EKSKLUSIF UNTUK BRAND ASTAGA**. Brand switcher dihilangkan dari antarmuka halaman ini.

### C. Perimeter Monitoring: Tim SCO & Non-Prima
* Monitoring difokuskan secara presisi kepada toko mitra yang memiliki paparan risiko kredit/plafon:
  1. Berada di bawah binaan **Tim Sales Officer (SCO)** resmi (`Abdul Harris`, `Febri Kurniawan`, `Hupron`, `Khoirul Anan`, `Mas Komarjaya`) di 4 cabang fisik (`BSD`, `ICON`, `PP`, `PRG`).
  2. Tipe agen **BUKAN Prima** (hanya memonitor tipe **`Limit`** dan **`Non Limit`**).
  3. Mengeliminasi pendaftaran mandiri (`ONLINE`), non-sales (`NON SCO`), dan akun internal (`AR00037`, `AR00009`, `AR20408`).
  4. Total populasi terpantau di level Toko Induk Agen: **350 agen**.

---

## 2. ARSITEKTUR HALAMAN & TAMPILAN UI (BLUEPRINT #YOY)

Halaman mengikuti standar desain enterprise emas dari `#yoy` (`pages/yoy/index.html`) sesuai ketetapan `GEMINI.md`:
* **Header Posisi Atas (`.ewallet-header`)**:
  - Judul: `E-Wallet Monitoring` (Font 20px, Bold 700).
  - Period Pill: Indikator dot biru dengan deskripsi periode aktif (*Oktober 2026 MTD*).
  - Status Badge: Badge pill `ASTAGA` di pojok kanan atas.
  - Tombol Aksi: `Export Excel` (.XLSX) dengan format styling terstandar.
* **Navigasi Tab Underline (`.ewallet-tabs`)**:
  - **Tab 1: Analisa Fraud & Gestun** (Level Reseller individual).
  - **Tab 2: Tren EWallet Agen 2026** (Level Toko Induk Agen / Rollup).
* **Larangan Raw Emoji Unicode (Hukum 9 GEMINI.md)**:
  - Dilarang menaruh karakter emoji Unicode di teks, badge, maupun tabel.
  - Seluruh ikon antarmuka wajib menggunakan Vector SVG murni (*Feather/Lucide style* stroke 2px).

---

## 3. SPESIFIKASI TEKNIS TAB 1: ANALISA FRAUD & SELF-TRANSACTION

### A. Logika Deteksi Self-Transaction
Sistem mendeteksi transaksi yang ditembak ke nomor sendiri dengan membandingkan nomor tujuan transaksi terhadap database master kontak:
1. **Sumber Kontak Terdaftar**: Tabel `reseller_contacts` di SQLite `MASTER/master_data.db` (berisi `no_wa`, `no_sms`, dan JSON array `candidate_phones`).
2. **Normalisasi Nomor Telepon**:
   ```python
   def clean_phone_number(p: str) -> str:
       # Menghapus karakter non-digit, spasi, dan tanda hubung
       # Menstandarkan format: 08xxx atau 628xxx -> 8xxx
   ```
3. **Kriteria Flag Fraud**:
   - Jika nomor tujuan bersih berada di dalam daftar nomor terdaftar reseller (`clean_tujuan in registered_phones`).
   - Transaksi tersebut dihitung sebagai **`Hits Self-Trx`** dan nominal jualnya diakumulasikan sebagai **`Total Nominal Self-Trx (Rp)`**.

### B. Indikator & Metrik Utama
* **Hits Self-Trx**: Frekuensi transaksi e-wallet yang ditembak ke nomor HP sendiri.
* **Total Nominal Gestun**: Akumulasi perputaran rupiah dari transaksi ke nomor sendiri.
* **% Self-Trx**:
  $$\% \text{ Self-Trx} = \frac{\text{Hits Self-Trx}}{\text{Total Trx EW Toko}} \times 100\%$$
* **Modal Drilldown**: Tombol aksi *Detail* membuka pop-up tabel rincian transaksi (TrxID, waktu presisi detik, produk, nomor tujuan, harga beli, harga jual, dan status).

---

## 4. SPESIFIKASI TEKNIS TAB 2: TREN % EWALLET TOKO INDUK AGEN (2026)

### A. Aturan Agregasi & Rollup
* Transaksi seluruh reseller downline diagregasikan (*rollup*) ke Toko Induk Agen masing-masing (`root_agen_id`).
* Populasi: Tepat **350 Toko Induk Agen** (kombinasi tipe `Limit` dan `Non Limit` under SCO).

### B. Formula Porsi % E-Wallet (Hukum 1 GEMINI.md)
* Wajib dihitung dari **Jumlah Baris Transaksi Sukses (`COUNTROWS` / Frekuensi Hit)**.
* **DILARANG MENGGUNAKAN `SUM(qty)`** karena kolom `qty` pada produk transfer/denom bebas berisi nominal rupiah.
$$\% \text{ EWALLET Bulan M} = \frac{\text{Total Trx Hits Sukses E-Wallet Bulan M}}{\text{Total Trx Hits Sukses Seluruh Kategori Bulan M}} \times 100\%$$
$$\text{Avg 2026 \%} = \frac{\text{Total Trx Hits Sukses E-Wallet Sepanjang 2026}}{\text{Total Trx Hits Sukses Seluruh Kategori Sepanjang 2026}} \times 100\%$$

### C. Klasifikasi Ambang Batas Waspada
* 🔴 **Dominan E-Wallet ($\ge 50\%$)**: Toko yang mayoritas transaksinya diserap oleh e-wallet (indikasi kuat gestun atau konter non-pulsa).
* 🟡 **Sedang ($20\% - 49.9\%$)**: Toko dengan aktivitas e-wallet proporsional normal.
* 🔵 **Rendah ($< 20\%$)**: Toko konvensional dengan dominasi produk Telco reguler.

---

## 5. SINKRONISASI DATA NOMOR TUJUAN (AUTO-BACKFILL 01–20 OKTOBER)

### A. Kondisi Data Historis
* **21 – 27 Oktober 2026**: Nomor tujuan sudah lengkap tercatat 100% dari sinkronisasi harian server OtomaX (`astaga.tsv` / Parquet).
* **01 – 20 Oktober 2026**: Nomor tujuan di database transaksi awal kosong karena kolom tujuan belum ditarik saat export bulanan lama.

### B. Folder Penampung Resmi File Tujuan
File ekspor 2 kolom dari OtomaX (`TrxID` dan `Tujuan`) disimpan di:
```
C:\DMS RAW DATA\TRANSAKSI\ASTAGA\CSV\BULANAN\2026\INSERT TUJUAN\
```
Contoh penamaan file: `tujuan0110.tsv`, `tujuan0210.tsv`, `tujuan0310.tsv`, ..., `tujuan2010.tsv`.

### C. Alur Kerja Sinkronisasi Otomatis 3-Jalur

```
[OtomaX Export] ──► [Folder: INSERT TUJUAN\tujuan*.tsv]
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   [Opsi A: Buka Web]               [Opsi B: Script / API]
  http://localhost:8000/#ewallet      python sync_tujuan.py / GET /api/tujuan/sync
            │                                 │
            └────────────────┬────────────────┘
                             ▼
     [Auto-Import & Mtime Tracker (_IMPORTED_TUJUAN_TRACKER)]
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   [Simpan ke SQLite]               [Patch Cache Parquet]
    Tabel: trx_tujuan                 .cache/parts/astaga_2026_1026.parquet
   (master_data.db)                   .cache/trx_astaga_2026.parquet
            │                                 │
            └────────────────┬────────────────┘
                             ▼
               [Mirror ke C:\DMS RAW DATA\]
               [Reset Cache RAM Dashboard]
```

1. **Jalur Otomatis Web (Paling Disarankan)**:
   - Taruh file di folder `INSERT TUJUAN\`.
   - Buka atau refresh `http://localhost:8000/#ewallet`.
   - Engine mendeteksi file baru via timestamp `mtime`, mengimpor ke SQLite, menambal kolom `tujuan` di Parquet, dan merender data terkini secara instan.
2. **Jalur Terminal / CLI**:
   - Jalankan `python sync_tujuan.py`.
3. **Jalur HTTP API**:
   - Buka endpoint `http://localhost:8000/api/tujuan/sync`.

---

## 6. STRUKTUR BERKAS & KOMPONEN TEKNIS

| Komponen | Lokasi Berkas | Deskripsi & Tanggung Jawab |
| :--- | :--- | :--- |
| **Frontend UI** | `pages/ewallet/index.html` | Template layout Tab 1 & Tab 2, KPI Cards, Toolbar Filter, Modal Drilldown. |
| **Frontend Controller**| `pages/ewallet/ewallet.js` | Logika fetch API, rendering tabel, filter instan, pagination, dan Excel Export. |
| **Backend Engine** | `engines/fraud_engine.py` | Engine komputasi deteksi fraud, pencocokan kontak, kalkulasi tren bulanan, dan SQLite loader. |
| **Sync Engine** | `sync_tujuan.py` | Modul penyambung data nomor tujuan dari file TSV ke SQLite dan cache Parquet fisik. |
| **API Endpoints** | `server.py` | Endpoint FastAPI: `/api/reseller/fraud`, `/api/reseller/fraud/detail`, `/api/ewallet/tren`, `/api/tujuan/sync`. |
| **Database Master** | `MASTER/master_data.db` | SQLite database penyimpan tabel `trx_tujuan`, `reseller_contacts`, dan master hierarki. |

---

*Pedoman ini mengikat seluruh AI Agent dan pengembang untuk memastikan integritas perhitungan fraud, konsistensi data nomor tujuan, dan stabilitas laporan keuangan server.*
