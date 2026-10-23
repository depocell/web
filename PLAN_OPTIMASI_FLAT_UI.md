# 📋 BLUEPRINT OPTIMASI & STANDARISASI FLAT HIGH-PERFORMANCE UI (depas.my.id)

Dokumen ini adalah rencana teknis dan panduan eksekusi untuk mentransformasi sistem **Web Report Depo Cell (`depas.my.id`)** menjadi antarmuka yang ultra-ringan, instan (*snappy*), dan mengusung filosofi **Bloomberg Terminal Style: Tegas, Simple, dan Fungsional**.

---

## 🏛️ Filosofi Desain Resmi: "Bloomberg Terminal Style"
* **Tegas (High Contrast & Structured)**: Hirarki data jelas, angka rupiah & ID transaksi tajam terbaca instan.
* **Simple (Zero Gimmick)**: Tidak ada bayangan blur berlebihan, gradasi pelangi, atau animasi dekoratif lambat.
* **Fungsional (Data-First)**: Warna hanya digunakan untuk memberikan status bisnis nyata (🟢 Hijau = Sukses/Growth, 🔴 Merah = Drop/Gagal, 🟡 Kuning = Waspada/Pending).
* **Flat Border 1px**: Pembatas kartu dan tabel murni garis 1px presisi.

---

## 🎯 1. Target & Metrik Keberhasilan (Goals)
1. **Pangkas Payload Awal**: Mengurangi transfer data muat awal (*initial load*) dari **~2.5 MB** menjadi **< 350 KB** (penghematan > 85%).
2. **First Contentful Paint (FCP)**: Di bawah **100 ms** dengan eliminasi seluruh *render-blocking resources*.
3. **Scroll Rate**: Stabil di **60–120 FPS** pada tabel data berdensitas tinggi (bebas GPU stutter / lag).
4. **Desain Flat Modern**: Eliminasi drop shadow berat, dominasi garis flat 1px, badge kapsul 999px, dan kontras warna fungsional tanpa silau.

---

## 🏗️ 2. Rincian 4 Pilar Eksekusi

### PILAR 1: Diet Payload & Non-Blocking Assets (Hemat > 1.2 MB)
* [ ] **Non-Blocking Google Fonts**:
  * Ubah pemanggilan `Inter` di `templates/shell.html` menggunakan teknik `media="print" onload="this.media='all'"`.
  * Browser tidak akan menahan layar putih (*zero FOIT*).
* [ ] **Eliminasi Webfont JetBrains Mono**:
  * Ganti font angka dengan **Native OS Monospace** bawaan sistem:
    ```css
    --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    ```
  * Hemat transfer ~60 KB tanpa kehilangan presisi angka tabular.
* [ ] **On-Demand Dynamic Script Loader (Code Splitting)**:
  * Pindahkan `static/js/xlsx.full.min.js` (~850 KB) dan `static/js/html2canvas.min.js` (~200 KB) keluar dari `<head>` `templates/shell.html`.
  * Buat helper fungsi sederhana di `static/js/app.js`:
    ```javascript
    async function loadExportLibrary(type) {
      if (type === 'excel' && !window.XLSX) {
        await loadScript('/static/js/xlsx.full.min.js');
      } else if (type === 'canvas' && !window.html2canvas) {
        await loadScript('/static/js/html2canvas.min.js');
      }
    }
    ```
  * Script hanya di-download saat user benar-benar menekan tombol *"Export Excel"* atau *"Download PNG"*.

---

### PILAR 2: Pure Flat Design Standard (Border-First, Zero Shadow)
* [ ] **Eliminasi `box-shadow` Berlapis**:
  * Hapus seluruh drop shadow tebal pada kartu, baris tabel, dan modal.
  * Standardisasi Card Box:
    ```css
    .card, .card-box {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      box-shadow: none !important;
      border-radius: 8px;
    }
    ```
* [ ] **Palet Warna Off-White & Dark Slate**:
  * Background utama: `#f8fafc` (lembut, dingin, tidak silau).
  * Card / Surface: `#ffffff` (kontras tajam dengan latar).
  * Border pemisah: `#e2e8f0` (garis 1px tegas netral).
  * Teks utama: `#0f172a` (gelap pekat, keterbacaan tinggi).
  * Teks sekunder: `#64748b` (muted slate untuk metadata/subteks).
* [ ] **Standarisasi Pill Badges (Kapsul 999px)**:
  * Seluruh badge status (Sukses, Gagal, Cabang, Tipe Agen, Brand) menggunakan bentuk kapsul ramping:
    ```css
    .badge-pill {
      border-radius: 999px;
      padding: 2px 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }
    ```

---

### PILAR 3: DOM Rendering & Table Performance
* [ ] **Batasi Render Awal Tabel (Paginasi 25/50)**:
  * Hindari menyuntikkan ribuan tag `<tr>` ke `innerHTML` dalam 1 eksekusi serentak.
  * Tampilkan 25 atau 50 baris default per halaman dengan pagination instan.
* [ ] **Pola Sel 2 Lantai (Stacked Two-Line)**:
  * Jaga jumlah kolom horizontal maksimal 5–6 kolom (Lantai 1 = data kunci tebal; Lantai 2 = metadata muted).

---

### PILAR 4: Kepatuhan Dokumen Single Source of Truth (`GEMINI.md`)
* [ ] **100% Vector SVG Murni (Zero Raw Emoji)** di seluruh tombol, badge, dan judul.
* [ ] **Rumus Bisnis Terlindungi**: Daily Trx Run-rate (global cutoff server ALLEXCEPT) dan Net Profit server murni tetap terpusat di `engines/metrics_engine.py` dan `engines/profit_engine.py`.

---

### PILAR 5: Kebijakan Zero Subtitle (Title Only Policy)
* [ ] **Hapus Total Seluruh Subtitle Deskriptif**:
  * Sesuai arahan resmi: **Subtitle tidak diperlukan dan dihapus total di semua modul**.
  * User sudah memahami fungsi fitur hanya dari membaca Title-nya; penjelasan di bawahnya adalah redundan (*noise*).
  * Efek:
    * Mengurangi beban elemen DOM.
    * Menghemat ruang vertikal secara drastis (kartu & grafik menjadi lebih kompak dan padat data).
    * Tampilan menjadi 100% bersih, tegas, dan berwibawa layaknya konsol data terminal profesional.
* [ ] **Penerapan Title-Only**:
  * Contoh:
    * `PIVOT TRANSAKSI` (Langsung tabel & filter, tanpa teks penjelasan di bawahnya).
    * `ANALISA OPERASIONAL` (Langsung tombol pills filter & grafik).
    * `KUALITAS LAYANAN` (Langsung KPI & chart, tanpa teks deskripsi).
    * `DAILY TRX VS MEMBER AKTIF` (Langsung grafik).
    * `PRODUKTIVITAS MEMBER` (Langsung grafik).
    * `DAFTAR TOKO INDUK AGEN` (Langsung tabel data).
  * Pengecualian hanya untuk angka target SLA jika ada (misal badge pill kecil `≥ 98%`), bukan teks kalimat panjang.

---

## 🚀 3. Rencana Alur Eksekusi (Checklist Nanti Malam)
1. **Langkah 1**: Edit `templates/shell.html` (Non-blocking font + buang SheetJS & Html2Canvas dari `<head>`).
2. **Langkah 2**: Tambahkan helper dynamic loader di `static/js/app.js` untuk fungsi export.
3. **Langkah 3**: Sesuaikan CSS di `static/css/app.css` (Ganti font-mono ke native OS + ratakan border kartu ke flat 1px tanpa shadow).
4. **Langkah 4**: Uji coba di browser lokal (`http://localhost:8000`) dan periksa kecepatan FCP / Network tab DevTools.
5. **Langkah 5**: Sinkronisasi dan deploy ke VPS live `https://depas.my.id`.
