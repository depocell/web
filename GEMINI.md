# 🏛️ PEDOMAN STANDAR METRIK & ARSITEKTUR WEB REPORT (NON-NEGOTIABLE)

Dokumen ini adalah **Single Source of Truth (SOP Wajib)** untuk seluruh AI Agent yang bekerja di project `c:\WEB REPORT`.
Setiap kali menghitung metrik, membuat tabel, grafik, atau memodifikasi engine, agen **WAJIB** mematuhi hukum bisnis berikut:

---

## 1. HUKUM DAILY TRX (RUN-RATE HARIAN) & PENGHITUNGAN HIT
> **Problem:** 
> 1. Jika bulan Oktober baru berjalan 9 hari (MTD), membandingkan total transaksi bulanan secara langsung dengan September (30 hari full) adalah KESALAHAN FATAL karena membuat performa terlihat anjlok drastis secara semu.
> 2. Menghitung hari aktif per baris toko/agen/sales di pivot table (filter context) membuat toko yang sering tutup/libur memiliki pembagi hari lebih sedikit (misal 12 hari), sehingga Daily Trx-nya melonjak semu dan tidak adil.
> 3. Menjumlahkan `SUM(qty)` adalah KESALAHAN BESAR karena kolom `qty` di OtomaX untuk produk transfer saldo/denom bebas berisi nominal rupiah (50.000, 100.000).

* **ATURAN WAJIB:**
  1. **Definisi Total Trx Sukses (Hits / COUNTROWS)**:
     - Total transaksi sukses **WAJIB dihitung dari JUMLAH BARIS TRANSAKSI (`COUNTROWS` / Frekuensi Hit)**.
     - **DILARANG KERAS menggunakan `SUM(qty)`**!
  2. **Pembagi Hari Aktif Cut-off WAJIB GLOBAL SERVER**:
     - `Jumlah Hari Aktif Cut-off` adalah jumlah hari kalender server bertransaksi **SECARA GLOBAL** pada bulan tersebut (misal: September full = 30 hari, Oktober cut-off MTD = 16 hari).
     - **DILARANG KERAS menghitung hari aktif per-toko / per-agen / per-sales**. Toko yang hanya bertransaksi 12 hari di bulan September pembaginya **TETAP 30 HARI**.
  3. **Rumus Resmi**:
     $$\text{Daily Trx (Run-rate)} = \frac{\text{Total Trx Sukses (Hits)}}{\text{Jumlah Hari Aktif Cut-off Server (Global)}}$$
  4. **Pedoman Khusus DAX (Power Pivot / Power BI)**:
     Saat membuat measure DAX `[Jumlah Hari Aktif]`, **WAJIB menggunakan `ALLEXCEPT`** agar tidak terpengaruh filter context baris toko/sales:
     ```dax
     Jumlah Hari Aktif = 
     CALCULATE(
         COUNTROWS(SUMMARIZE('2026'; '2026'[Start of Month]; '2026'[Day]));
         ALLEXCEPT('2026'; '2026'[Start of Month]);
         '2026'[STATUS] = "Sukses";
         NOT('2026'[AR_ID] IN {"AR00037"; "AR00009"})
     )
     ```
  5. **Perbandingan Pertumbuhan Bulanan (MoM)**:
     $$\text{Growth Daily (Selisih)} = \text{Daily Bulan Ini} - \text{Daily Bulan Lalu}$$
     $$\text{Growth Daily \%} = \frac{\text{Daily Bulan Ini} - \text{Daily Bulan Lalu}}{\text{Daily Bulan Lalu}} \times 100\%$$
  6. Penyajian di tabel selalu tampilkan: **Daily Trx (/hari)** sebagai angka utama, dan total kumulatif bulanan sebagai info pendukung.

---

## 2. HUKUM NET PROFIT SERVER, HARGA JUAL DASAR & NET ARPU
> **Problem:** Di server OtomaX, harga jual yang tercatat di tabel transaksi adalah harga kotor yang sudah ditambah markup komisi upline. Menganggap `Jual - Beli` sebagai keuntungan bersih server adalah KESALAHAN BESAR.

* **ATURAN WAJIB:**
  1. Uang **`Markup`** adalah **KOMISI UPLINE / TOKO INDUK**, BUKAN laba milik server/perusahaan!
  2. Rumus Finansial:
     * $$\text{Harga Jual Dasar Server} = \text{Harga Jual Kotor} - \text{Markup}$$
     * $$\text{Gross Margin (Kotor)} = \text{Harga Jual Kotor} - \text{Harga Beli}$$
     * $$\text{Komisi Upline (Rabat)} = \text{Markup}$$
     * $$\text{Net Profit Murni Server} = (\text{Harga Jual} - \text{Markup}) - \text{Harga Beli}$$
     * $$\text{Net Profit per Trx (Yield)} = \frac{\text{Total Net Profit Server}}{\text{Total Trx Sukses}}$$
     * $$\text{Net ARPU (Revenue Bersih / Hit)} = \frac{\text{Total Net Revenue Server}}{\text{Total Trx Sukses}} = \frac{\sum(\text{Harga Jual} - \text{Markup})}{\text{Total Trx Sukses}}$$
     * $$\text{Margin Laba Bersih \%} = \frac{\text{Net Profit Server}}{\text{Harga Jual Dasar Server}} \times 100\%$$
  3. Agen Langsung (di bawah cabang langsung): `Markup = 0`, sehingga Net Profit = Gross Margin dan Harga Jual Dasar = Harga Jual Kotor.
  4. Reseller Downline: `Markup > 0`, seluruh metrik omset & profit server wajib menggunakan nilai setelah dipotong komisi markup upline.

---

## 3. HUKUM DURASI & SPEED TELEMETRY (SLA LAYANAN)
> **Problem:** Transaksi yang berstatus Gagal, Timeout, atau Dibatalkan sering kali menggantung lama hingga puluhan menit/jam. Jika diikutsertakan, rata-rata kecepatan server akan rusak dan tidak mencerminkan kenyataan.

* **ATURAN WAJIB:**
  1. Rumus Durasi:
     $$\text{Durasi Detik} = \text{tgl\_stat} - \text{tgl\_entry}$$
  2. Durasi rata-rata kecepatan server **HANYA BOLEH DIHITUNG DARI STATUS SUKSES**:
     ```python
     df_speed = df[(df['status'].str.lower() == 'sukses') & (df['durasi_sec'] >= 0) & (df['durasi_sec'] <= 86400)]
     avg_speed = df_speed['durasi_sec'].mean()
     ```
  3. Format string durasi selalu `mm:ss` (misal 23 detik = `00:23`, 75 detik = `01:15`).
  4. Klasifikasi Kecepatan / SLA:
     * 🟢 **PRIMA**: Sukses $\ge 98\%$ & Speed $< 15$ detik.
     * 🟡 **WASPADA**: Sukses $95\% - 97.9\%$ atau Speed $15 - 30$ detik.
     * 🔴 **GANGGUAN / EVALUASI**: Sukses $< 95\%$ atau Speed $> 30$ detik.

---

## 4. HUKUM FILTER AKUN INTERNAL ASTAGA
* Akun internal operasional berikut **WAJIB SELALU DI-EXCLUDE** dari seluruh komputasi ASTAGA:
  * `AR00037`
  * `AR00009`
  * `AR20408`
* *(Catatan: Akun OKIPAY seperti OP00037 & OP00009 tetap sah dan TIDAK di-exclude).*

---

## 5. ARSITEKTUR & PENGGUNAAN HELPER RESMI
Agen **DILARANG** menulis ulang rumus matematika manual di file frontend/halamannya sendiri-sendiri.
Gunakan selalu fungsi terpusat dari engine resmi:
```python
import engines.metrics_engine as me

# 1. Hitung hari aktif cut-off
days_curr = me.get_active_days(df_curr)

# 2. Hitung Daily Trx rate
daily_rate = me.calculate_daily_rate(total_trx, days_curr)

# 3. Hitung Harga Jual Dasar Server & Net Profit
base_price = me.calculate_server_base_price(jual, markup)
net_profit = me.calculate_net_profit(jual, beli, markup)
margin_pct = me.calculate_margin_pct(net_profit, base_price)

# 4. Hitung Net ARPU (Rata-rata Revenue Bersih per Trx Sukses)
net_arpu = me.calculate_net_arpu(total_net_revenue, total_trx_sukses)

# 5. Format durasi ke mm:ss
dur_str = me.format_duration_str(seconds)
```

---

## 6. ENGINE ANALISA REVENUE & PROFIT RESMI
Untuk analisa omset, modal, komisi markup upline, dan laba bersih server:
```python
import engines.profit_engine as profit_engine

# Hitung analisa revenue & profit
res = profit_engine.calculate_profit_analysis(brand="ASTAGA", year="2026", month_code="2026-10")
# Endpoint API Web:
# GET /api/analisa/profit?brand=ASTAGA&year=2026&month=2026-10
```

---

## 7. HUKUM PEMETAAN CABANG & TIM SALES (SCO)
* **Cabang ONLINE**: Seluruh agen di bawah cabang `ONLINE` (pendaftaran mandiri via Google PlayStore) **WAJIB memiliki SCO = 'ONLINE'** (BUKAN `NON SCO`).
* **Cabang Fisik (`BSD`, `ICON`, `PP`, `PRG`)**: Status `NON SCO` **hanya diperuntukkan** bagi agen di bawah cabang fisik (tipe agen *Walk In* yang mendaftar langsung ke cabang).
* Cabang fisik dilarang memiliki SCO `ONLINE`, dan cabang `ONLINE` dilarang berstatus `NON SCO`.

---

## 8. HUKUM KLASIFIKASI TIPE AGEN ASTAGA & LIMIT SALDO
Tipe agen untuk brand ASTAGA memiliki tepat 3 klasifikasi resmi (DILARANG menggunakan `Standard` atau nama lain):
1. **`Limit`**:
   * Agen yang memiliki plafon kredit/limit saldo aktif (`limit_saldo != 0`).
   * Di server OtomaX, limit saldo tersimpan sebagai plafon negatif (misal `-1.000.000`).
   * Pada UI ditampilkan sebagai nilai rupiah positif (misal `Rp 1.000.000`).
2. **`Non Limit`**:
   * Agen cabang fisik (toko fisik non-prima seperti grup `MV`, `RV`, `RL`, `M`, `R`, dsb) yang sebelumnya memiliki limit saldo, namun karena evaluasi operasional plafonnya telah dihilangkan (`limit_saldo == 0`).
   * Tipenya berstatus `Non Limit` (BUKAN `Prima`).
3. **`Prima`**:
   * Agen yang dari awal pendaftarannya memang tidak membutuhkan plafon limit saldo (`limit_saldo == 0`), mencakup:
     - Reseller grup `P` (Prima reguler).
     - Seluruh agen di bawah cabang `ONLINE` (pendaftaran mandiri via Google PlayStore).
* Sinkronisasi data bulanan dari OtomaX (`astaga.tsv`) wajib otomatis memperbarui status limit dan tipe ini.

---

## 9. HUKUM DESAIN UI: LARANGAN RAW EMOJI (WAJIB VECTOR SVG)
> **Problem:** Menggunakan icon emoji visual (seperti `⚡`, `🎯`, `📦`, `💰`, `🏢`, `💳`, `💡`, `📈`, `📉`, `🔥`, `🪙`, `📅`, `🔤`, `🔄`, `✅`, `❌`, `🚨`, `⏱️`, `⭐`, `🌳`, `✏️`, `🏬`, dll.) membuat tampilan aplikasi terlihat casual, inkonsisten antar OS/browser, dan tidak memenuhi standar estetika enterprise.

* **ATURAN WAJIB:**
  1. **DILARANG KERAS** menaruh karakter emoji Unicode di template HTML, judul halaman/card/tabel, badge status, tombol aksi, maupun teks label opsi dropdown `<select>`.
  2. Seluruh icon antarmuka **WAJIB menggunakan Vector SVG murni** (Lucide / Feather style: stroke terukur `stroke-width="2"`, `viewBox="0 0 24 24"`, ukuran proporsional `12px - 20px`, dan mengikuti tema warna `currentColor` atau CSS variables).
  3. Untuk indikator status dan peringkat, gunakan badge pill typography yang tegas (misal `#1, #2, #3`, badge dot bulat, atau teks pill murni), BUKAN medali/emoji warna.
  4. Pada elemen dropdown `<select>`, opsi teks **WAJIB teks bersih profesional** tanpa awalan/akhiran emoji.

---

## 10. HUKUM STANDAR ARSITEKTUR & DESAIN PAGE: BLUEPRINT #YOY (GOLD STANDARD)
> **Single Source of Truth Desain Halaman:**
> Seluruh halaman baru atau pembaruan halaman lama di Web Report **WAJIB MENGIKUTI STRUKTUR & BENTUK VISUAL DARI `http://localhost:8000/#yoy` (`pages/yoy/index.html`)**.
> Dilarang membuat variasi container tab bertumpuk, segmented pill box kuno, atau tata letak header acak-acakan.

* **ANATOMI STRUKTUR WAJIB SETIAP HALAMAN:**

  ### 1. Root Container & Top Header (`.page-header`)
  * Container terluar memiliki layout flex column vertikal dengan `gap: 16px; padding-bottom: 40px;`.
  * Header berada di posisi paling atas dengan layout flex horizontal (`justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;`).
  * **Kiri (Title Group)**:
    - Judul utama menggunakan tag `<h1>` (`font-size: 20px; font-weight: 700; letter-spacing: -0.3px; color: var(--text-main); margin: 0;`).
    - Subtitle / badge keterangan menggunakan pill badge dengan dot bulat (`.period-pill` / `.period-dot`, misal `#0284c7` atau `#059669`).
  * **Kanan (Unified Brand Switcher)**:
    - Jika halaman mendukung multi-brand (ASTAGA / OKIPAY), switch brand ditaruh di sisi kanan header menggunakan `.unified-brand-switcher`.

  ### 2. Navigasi Tab Halaman (`.page-tabs` / Border-Bottom Underline)
  * Bar navigasi tab terbentang penuh di bawah header dengan garis batas bawah halus (`border-bottom: 1px solid var(--surface-border); padding-bottom: 2px; margin-top: 4px; overflow-x: auto; scrollbar-width: thin;`).
  * Tombol tab (`.tab-btn`):
    - Background transparan, tanpa border samping/atas (`background: transparent; border: none; border-bottom: 2px solid transparent;`).
    - Padding proporsional (`padding: 8px 16px; font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer; white-space: nowrap;`).
    - Efek aktif: Warna teks berubah ke `var(--primary)` dan garis bawah aktif `border-bottom-color: var(--primary)`.
    - Setiap tab memiliki Vector SVG icon (14px) + label terstruktur (misal: `Tab 1: ...`, `Tab 2: ...`).

  ### 3. Panel Konten & Kartu Analisa (`.chart-panel` / Border-First)
  * Hindari card tebal bertumpuk. Gunakan container bersih border-first:
    ```css
    background: var(--surface);
    border: 1px solid var(--surface-border);
    border-radius: 8px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    ```
  * Panel header memiliki judul ber-dot indikator warna (`.chart-panel-title-dot`) dan sub-toggle ramping jika ada multi-view (`.chart-subtoggle` & `.chart-subtoggle-btn`).

* **TEMPLATE RESMI ARSITEKTUR HTML & CSS (CONTEKAN WAJIB):**
```html
<style>
  .modul-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-bottom: 40px;
  }

  .modul-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  .modul-title-group h1 {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.3px;
    margin: 0;
    color: var(--text-main);
  }

  .modul-period-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: var(--surface-bg);
    border: 1px solid var(--surface-border);
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    margin-top: 4px;
  }

  .modul-period-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #0284c7;
  }

  /* TABS NAVIGATION (IDENTIK #YOY) */
  .modul-tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--surface-border);
    padding-bottom: 2px;
    margin-top: 4px;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .modul-tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    text-decoration: none;
  }

  .modul-tab-btn:hover {
    color: var(--text-main);
  }

  .modul-tab-btn.active {
    color: var(--primary);
    border-bottom-color: var(--primary);
    background: transparent;
    box-shadow: none;
  }
</style>

<div class="modul-container">

  <!-- TOP HEADER -->
  <div class="modul-header">
    <div class="modul-title-group">
      <h1>Judul Modul Halaman</h1>
      <div class="modul-period-pill">
        <span class="modul-period-dot"></span>
        <span id="modul-subtitle-label">Deskripsi atau subtitle status modul</span>
      </div>
    </div>

    <!-- Unified Brand Switcher (Opsional jika modul butuh ASTAGA vs OKIPAY) -->
    <div class="unified-brand-switcher" id="modul-brand-switcher">
      <button type="button" id="btn-brand-astaga" class="unified-brand-btn active" data-brand="ASTAGA" onclick="switchModulBrand('ASTAGA')">
        <span class="brand-dot"></span>
        ASTAGA
      </button>
      <button type="button" id="btn-brand-okipay" class="unified-brand-btn" data-brand="OKIPAY" onclick="switchModulBrand('OKIPAY')">
        <span class="brand-dot" style="background:#dc2626;"></span>
        OKIPAY
      </button>
    </div>
  </div>

  <!-- TAB NAVIGATION -->
  <div class="modul-tabs">
    <button type="button" class="modul-tab-btn active" id="tab-btn-1" onclick="switchModulTab('tab1')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
      </svg>
      <span>Tab 1: Ringkasan Utama</span>
    </button>
    <button type="button" class="modul-tab-btn" id="tab-btn-2" onclick="switchModulTab('tab2')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line>
        <line x1="9" y1="21" x2="9" y2="9"></line>
      </svg>
      <span>Tab 2: Analisa Detil</span>
    </button>
  </div>

  <!-- CONTENT VIEW SECTION (Tab 1) -->
  <div id="content-tab-1" style="display: flex; flex-direction: column; gap: 18px;">
    <!-- Konten Tab 1 -->
  </div>

  <!-- CONTENT VIEW SECTION (Tab 2) -->
  <div id="content-tab-2" style="display: none; flex-direction: column; gap: 18px;">
    <!-- Konten Tab 2 -->
  </div>

</div>
```

---
*Pedoman ini dibuat agar seluruh AI Agent di thread/chat mana pun memiliki output angka yang 100% konsisten, adil, dan valid, serta tampilan antarmuka yang modern, presisi, dan berstandar enterprise.*

