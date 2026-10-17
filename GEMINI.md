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
*Pedoman ini dibuat agar seluruh AI Agent di thread/chat mana pun memiliki output angka yang 100% konsisten, adil, dan valid, serta tampilan antarmuka yang modern, presisi, dan berstandar enterprise.*

