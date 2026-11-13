# 🏛️ Dokumentasi & Spesifikasi Executive Overview Dashboard

> **Dokumen Resmi Arsitektur & Spesifikasi Matriks Performa Bisnis Web Report**  
> *Lokasi Modul:* `http://localhost:8000/#overview`  
> *Frontend File:* [`pages/home/index.html`](file:///c:/WEB%20REPORT/pages/home/index.html) & [`pages/home/home.js`](file:///c:/WEB%20REPORT/pages/home/home.js)  
> *Backend Engine:* [`engines/overview_engine.py`](file:///c:/WEB%20REPORT/engines/overview_engine.py)  
> *Versi Rilis:* v2.5 (November 2026 — 3 Pilar Bisnis + Konsolidasi)

---

## 1. Peran & Konsep Utama Modul

Halaman **Executive Overview** dirancang dengan prinsip **Zero Switcher, Zero Re-computation, dan Pemisahan Pilar Bisnis yang Adil (Fair Business Scoping)**:
* **Zero Switcher**: Manajemen dan eksekutif tidak perlu berganti-ganti filter brand/cabang untuk melihat kesehatan bisnis secara utuh. Data disajikan dalam bentuk matriks komparasi 3 Pilar Bisnis + 1 Kolom Total Konsolidasi:
  1. **ASTAGA Reload**: Retail & Cabang Fisik (`BSD`, `ICON`, `PP`, `PRG`) serta pendaftaran mandiri `ONLINE`.
  2. **OKIPAYMENT (RETAIL)**: Khusus Channel Online PlayStore (reseller retail mandiri).
  3. **OKIPAYMENT (H2H)**: Khusus Jalur Server B2B Host-to-Host (*DIGIFLAZZ, Pinasthika, DKN, NS Reload, Astaga Reload*).
  4. **KONSOLIDASI**: Total akumulasi seluruh server dan entitas bisnis.
* **Fair Business Scoping (Pemisahan Mesin vs Manusia)**:
  - *Problem Sebelumnya:* Jalur H2H OKIPAY menyumbang volume masif (77.000+ trx dalam 6 hari) hanya dari 5 akun mesin partner switching. Jika digabungkan dengan channel Retail, metrik produktivitas akun (TPM) terdistorsi menjadi tidak wajar (`77.55 trx/akun/hari`).
  - *Solusi:* Memisahkan kolom Retail OKIPAY dan H2H OKIPAY. Dengan pemisahan ini, produktivitas retail OKIPAY terbukti sehat dan berimbang di angka **`6.24 trx/akun/hari`** (sebanding dengan ASTAGA Retail di **`5.41 trx/akun/hari`**), sedangkan H2H berdiri sendiri sebagai server switching di angka **`2.994,37 trx/mitra/hari`**.
* **Zero Re-computation**: Frontend dan engine overview tidak menghitung ulang jutaan baris transaksi dari awal (Parquet/Database). Engine overview menghimpun sari pati yang sudah divalidasi dari engine spesialis (`analisa_engine`, `reseller_engine`, dan `daily_engine`).

---

## 2. Diagram Arsitektur & Alur Data

```
┌─────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│  engines/analisa_engine │   │ engines/reseller_engine  │   │   engines/daily_engine   │
│  - Daily Trx & Hits     │   │ - Akun Aktif & Retained  │   │ - Avg Daily Akun Aktif   │
│  - Telemetri SLA Speed  │   │ - Reaktivasi, Baru, Churn│   │ - Produktivitas TPM Harian│
│                         │   │ - Scoped per Cabang      │   │ - Performa per Cabang    │
└────────────┬────────────┘   └────────────┬─────────────┘   └────────────┬─────────────┘
             │                             │                              │
             └──────────────────────┬──────┴──────────────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │  engines/overview_engine.py  │
                    │  (Pemisahan 4 Segmen Bisnis) │
                    └──────────────┬───────────────┘
                                    │  GET /api/overview
                                    ▼
                    ┌──────────────────────────────┐
                    │     pages/home/home.js       │
                    │   (Murni Display / No Calc)  │
                    └──────────────┬───────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │    pages/home/index.html     │
                    │  Executive Comparison Matrix │
                    │ (ASTAGA | OKI-RET | H2H | TOT│
                    └──────────────────────────────┘
```

---

## 3. Struktur Komponen Antarmuka

### A. Top Summary Ribbon (3 Kartu KPI Utama Konsolidasi)
Terletak tepat di bawah header halaman untuk memberikan pandangan kilat skala total perusahaan:
1. **TOTAL DAILY RUN-RATE**:
   * Angka utama: `Total Daily Trx (Hits) / Hari` gabungan seluruh server.
   * Subteks: Akumulasi total transaksi sukses MTD dan total transaksi masuk.
2. **TOTAL BASIS AKUN AKTIF**:
   * Angka utama: Akumulasi total akun reseller/downline unik yang bertransaksi bulan ini.
   * Subteks: Jumlah akun setia (*Retained*).
3. **KUALITAS & SLA LAYANAN**:
   * Angka utama: Persentase transaksi sukses gabungan.
   * Subteks: Rata-rata durasi kecepatan server dalam format `mm:ss` beserta status SLA (*Prima / Waspada*).

---

### B. Matriks Perbandingan Terpadu (Tabel Utama 5 Kolom)

Tabel utama memiliki 5 kolom:
`[Metrik Evaluasi]` | `[ASTAGA RELOAD (Retail)]` | `[OKIPAY (RETAIL)]` | `[OKIPAY (H2H)]` | `[KONSOLIDASI (Total Server)]`

Dibagi menjadi 3 seksi evaluasi terstruktur:

#### I. PERFORMA TRANSAKSI & RUN-RATE (MTD)
* **Daily Trx (Run-rate Harian)**:
  $$\text{Daily Trx} = \frac{\text{Total Trx Sukses (Hits)}}{\text{Jumlah Hari Aktif Cut-off Global Server}}$$
  *Sesuai Hukum 1 GEMINI.md: Wajib menggunakan `COUNTROWS` (frekuensi hit), dilarang menggunakan `SUM(qty)`, dan pembagi hari aktif bersifat global server.*
* **Total Transaksi Masuk**: Seluruh request transaksi yang masuk ke server (Sukses, Gagal, Timeout).
* **Total Trx Sukses (Hits)**: Jumlah transaksi berstatus Sukses.
* **SLA Kecepatan Layanan (Avg Speed)**:
  $$\text{Avg Speed} = \text{Mean}(\text{tgl\_stat} - \text{tgl\_entry}) \quad \text{[Khusus Status Sukses]}$$
  *Sesuai Hukum 3 GEMINI.md: Format selalu `mm:ss` dengan klasifikasi Prima (< 15 dtk / < 20 dtk), Waspada (15-30 dtk), atau Gangguan (> 30 dtk).*
* **Tingkat Keberhasilan (% Sukses)**: $\frac{\text{Total Sukses}}{\text{Total Masuk}} \times 100\%$.

#### II. KESEHATAN BASIS AKUN (#AGEN TAB RESELLER)
*Seluruh unit metrik pada seksi ini telah diseragamkan menggunakan istilah **"akun"** (atau "mitra" untuk H2H) dengan sumber data mengacu ke level reseller individual ([`engines/reseller_engine.py`](file:///c:/WEB%20REPORT/engines/reseller_engine.py)).*

* **Akun Aktif Bertransaksi**: Total akun unik yang bertransaksi minimal 1 kali pada bulan berjalan.
* **Avg Daily Akun Aktif**: Rata-rata jumlah akun unik yang aktif bertransaksi per hari (ditarik dari [`engines/daily_engine.py`](file:///c:/WEB%20REPORT/engines/daily_engine.py)).
* **Akun Setia (Retained)**: Akun yang bulan lalu aktif dan bulan ini tetap aktif bertransaksi rutin.
* **Akun Reaktivasi (+)**: Akun terdaftar lama yang pada bulan lalu pasif (0 transaksi), namun bulan ini aktif kembali.
* **Akun Baru Terdaftar (+)**: Akun yang baru mendaftar pada bulan berjalan dan langsung aktif bertransaksi.
* **Akun Pasif / Churn (-)**: Akun yang bulan lalu aktif bertransaksi, namun pada bulan berjalan 0 transaksi.
* **Produktivitas Akun (Daily Trx / Akun)**:
  $$\text{Produktivitas Akun} = \frac{\text{Daily Trx (Run-rate Harian)}}{\text{Avg Daily Akun Aktif}}$$
  *Sinkron 100% dengan metrik `tpm_curr` pada modul [`#daily`](file:///c:/WEB%20REPORT/pages/daily/index.html).*

#### III. SALURAN, PORSI PENJUALAN & SUPLIER
* **Kategori Produk Terbesar**: Kategori dengan volume transaksi tertinggi (TELCO).
* **Porsi Transaksi E-Wallet**: Persentase transaksi produk e-wallet / transfer saldo terhadap total transaksi sukses.
* **Saluran / Cabang Terbesar**: Cabang atau jalur dengan volume transaksi dominan (misal: `BSD` di ASTAGA, `ONLINE` di OKIPAY Retail, `H2H` di OKIPAY Mitra).
* **Kesehatan Suplier (Gate/Modul Aktif)**: Jumlah modul/gate supplier berstatus Prima vs Waspada vs Gangguan.

---

## 4. Kepatuhan Standar Bisnis & Arsitektur (GEMINI.md)

1. **Hukum 1 (Daily Trx Global)**: Pembagi hari aktif tidak dihitung per-toko/per-akun melainkan cut-off server global MTD.
2. **Hukum 3 (Telemetri Speed SLA)**: Rata-rata kecepatan hanya dihitung dari transaksi Sukses dengan durasi valid (0 s/d 86.400 detik).
3. **Hukum 4 (Filter Internal ASTAGA)**: Akun operasional internal ASTAGA (`AR00037`, `AR00009`, `AR20408`) selalu di-exclude dari komputasi.
4. **Hukum 5 (Frontend Bebas Rumus)**: [`pages/home/home.js`](file:///c:/WEB%20REPORT/pages/home/home.js) murni bertugas melakukan manipulasi DOM/tampilan dan formatting (`.toLocaleString('id-ID')`, `.toFixed()`). Seluruh rumus dihitung di backend engine resmi.
5. **Hukum 9 (Desain Bebas Raw Emoji)**: Menggunakan icon Vector SVG murni (Feather/Lucide style) dan badge pill typography tanpa emoji mentah.
6. **Hukum 10 (Struktur Blueprint #YoY)**: Mengikuti tata letak flex vertikal, header title dengan period dot indicator, dan border-first card panel.

---

## 5. API Endpoint Reference

* **URL:** `GET /api/overview`
* **Query Parameters:**
  * `year` (opsional, default: `"2026"`)
  * `force` (opsional, `"1"` untuk membersihkan cache in-memory dan memaksa komputasi ulang)
* **Response Payload Structure:**
  ```json
  {
    "ok": true,
    "year": "2026",
    "month": "11",
    "month_label": "Harian (November 2026) • MTD 6 Hari",
    "active_days": 6,
    "astaga": {
      "brand_title": "ASTAGA Reload",
      "brand_tag": "Retail & Cabang Fisik",
      "daily_trx": 6545.0,
      "total_trx": 40183,
      "total_sukses": 39271,
      "speed_str": "00:24",
      "speed_status": "Waspada",
      "sukses_str": "97.7%",
      "active_cust": 1695,
      "avg_daily_mem": 1210.8,
      "retained_cust": 1671,
      "reactivated_cust": 22,
      "new_cust": 2,
      "churn_cust": 298,
      "tpm": 5.41,
      "ewallet_pct": 22.3
    },
    "okipay_online": {
      "brand_title": "OKIPAY (RETAIL)",
      "brand_tag": "Online Channel",
      "daily_trx": 1096.5,
      "total_trx": 6996,
      "total_sukses": 6579,
      "speed_str": "00:14",
      "speed_status": "Prima",
      "sukses_str": "94.0%",
      "active_cust": 262,
      "avg_daily_mem": 175.8,
      "retained_cust": 257,
      "reactivated_cust": 4,
      "new_cust": 1,
      "churn_cust": 62,
      "tpm": 6.24,
      "ewallet_pct": 22.4
    },
    "okipay_h2h": {
      "brand_title": "OKIPAY (H2H)",
      "brand_tag": "Mitra B2B Server",
      "daily_trx": 12875.8,
      "total_trx": 79089,
      "total_sukses": 77255,
      "speed_str": "00:21",
      "speed_status": "Waspada",
      "sukses_str": "97.7%",
      "active_cust": 5,
      "avg_daily_mem": 4.3,
      "retained_cust": 3,
      "reactivated_cust": 0,
      "new_cust": 2,
      "churn_cust": 0,
      "tpm": 2994.37,
      "ewallet_pct": 0.0
    },
    "total": {
      "brand_title": "GABUNGAN",
      "brand_tag": "Total Server",
      "daily_trx": 20517.3,
      "total_trx": 126268,
      "total_sukses": 123105,
      "speed_str": "00:22",
      "speed_status": "Waspada",
      "sukses_str": "97.5%",
      "active_cust": 1962,
      "avg_daily_mem": 1390.9,
      "retained_cust": 1931,
      "reactivated_cust": 26,
      "new_cust": 5,
      "churn_cust": 360,
      "tpm": 14.75,
      "ewallet_pct": 8.3
    }
  }
  ```
