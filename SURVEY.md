# 📱 DOKUMENTASI LENGKAP FITUR SURVEI INTERAKTIF AI & REAKTIVASI RESELLER

Dokumen ini adalah ringkasan teknis dan operasional untuk seluruh tim mengenai **Fitur Survei Interaktif AI** yang baru saja dibangun di ekosistem **Web Report Depo Cell**.

---

## 1. Latar Belakang & Keputusan Arsitektur: Reseller vs Agen

### A. Mengapa Survei Ditempatkan Khusus di Modul RESELLER?
Pada hierarki server OtomaX / Depo Cell:
1. **Agen (Toko Induk)** hanyalah entitas payung (*grouping/upline*). Jika sebuah toko induk memiliki 5 anak reseller dan 4 di antaranya berhenti jualan pulsa, di level Agen toko tersebut masih terlihat "aktif" semu karena ada 1 anak yang bertransaksi.
2. **Reseller** adalah akun riil yang langsung bertransaksi (bisa berstatus toko induk langsung, maupun downline konter perorangan). Akun inilah yang memegang saldo, mengirim transaksi, dan memiliki nomor kontak WhatsApp sesungguhnya.
3. **Fakta Data:**
   * Di level Toko Induk Agen, hanya ada **81 toko** yang pasif total.
   * Di level **Reseller**, ada **159 akun/toko riil** yang mengalami churn (bulan lalu aktif transaksi, namun bulan ini 0 transaksi).
   * Menargetkan survei di level **RESELLER** memastikan tim marketing menyelamatkan seluruh 159 titik penjualan tanpa ada yang terlewat.

---

## 2. Pemetaan Kontak WhatsApp (`MASTER/PENGIRIM`)

Data kontak berhasil diintegrasikan ke database SQLite `MASTER/master_data.db` pada tabel **`reseller_contacts`**:
* **Sumber Data**: 
  * `MASTER/PENGIRIM/Jabber.tsv` (WhatsApp JID resmi `@c.us`).
  * `MASTER/PENGIRIM/SMS.tsv` (Nomor seluler GSM).
* **Hasil Ingestion**:
  * Total kontak di database: **25.849 reseller terstandarisasi** (`628...`).
  * **Tingkat Pencocokan Reseller Churn: 100% (159 dari 159 reseller pasif memiliki kontak WhatsApp valid)**.

---

## 3. Alur Kerja & Mesin AI (`engines/survey_engine.py`)

Alur survei berjalan secara interaktif dua arah (*Two-Way Conversational*):

```
[Web Report: #survey] ──► [WhatsApp Gateway (Baileys Node.js)] ──► [WhatsApp Reseller]
         ▲                                                               │
         │                                                               ▼
[Database: survey_churn_logs] ◄── [NLP Intent & Sentiment AI] ◄── [Balasan Reseller]
```

### A. Personalisasi Pesan Otomatis (Outbound)
Pesan tidak dikirim sebagai blast kaku (spam), melainkan disusun secara empatik dengan menyertakan data histori transaksi:
> *"Halo Kak di **[Nama Toko/Reseller]**! Salam hangat dari tim layanan **ASTAGA**.*
> *Kami perhatikan bulan lalu akun Kakak sangat aktif bertransaksi (**[X] transaksi**). Namun di bulan ini kami melihat belum ada transaksi yang tercatat di sistem kami.*
> *Boleh kami tahu Kak, apakah saat ini ada kendala teknis pada aplikasi, kendala harga/stok produk, atau ada kendala modal/saldo? Kami sangat ingin membantu agar penjualan pulsa di toko Kakak bisa kembali lancar.*
> *Terima kasih banyak atas waktunya ya Kak!"*

### B. Otomasi Klasifikasi Balasan (Inbound NLP AI)
Saat reseller membalas chat di WhatsApp dengan bahasa bebas, sistem langsung mengklasifikasikan:
* **Kategori Kendala**:
  * `KENDALA_SALDO` (modal tipis, saldo ketahan, lagi belum ada dana, sepi)
  * `KENDALA_APLIKASI` (error, timeout, login gagal, lemot, aplikasi rusak)
  * `KENDALA_HARGA` (kalah harga, kompetitor sebelah lebih murah, untung kecil)
  * `TOKO_TUTUP` (tutup sementara, libur, pindah tempat, ganti usaha)
  * `LAINNYA` (pertanyaan umum, sapaan balik)
* **Sentimen Pelanggan**: `POSITIF`, `NETRAL`, `NEGATIF`.
* **Kebutuhan Kunjungan SCO**: Otomatis bernilai `1` jika reseller meminta spanduk, brosur, atau didatangi tim sales lapangan.

---

## 4. Halaman Baru di Web Report: `Survei AI` (`#survey`)

Telah dibuat modul halaman terpisah khusus survei di menu sidebar:

### Tab 1: List Reseller Target (Siap Disurvei)
* Tabel 159 reseller pasif/churn lengkap dengan nama toko induk, cabang, SCO, transaksi lalu, dan nomor WA.
* Filter per Cabang (BSD, ICON, PP, PRG, ONLINE) dan kotak pencarian instan.
* **Tombol Survei Satuan**: Membuka modal pop-up untuk melihat/mengedit pesan AI, serta opsi **Mode Uji Coba** (kirim ke nomor sendiri).
* **Tombol Survei AI Batch**: Memproses sapaan masal ke seluruh reseller yang dicentang.

### Tab 2: Log Survei (Riwayat Percakapan)
* Rekapitulasi seluruh survei yang pernah dikirim dan dibalas.
* Kolom tabel: Waktu Kirim, Reseller, Nomor Tujuan, Status (`TERKIRIM` / `SUDAH BALAS`), **Balasan Asli dari WhatsApp**, Kategori Kendala AI, dan Status Kebutuhan Kunjungan SCO.

### Tab 3: Chart Hasil Survei (Analitik Visual)
* **4 Kartu KPI**: Total Survei Terkirim, Tingkat Respon (*Response Rate %*), Kendala Terbanyak, Jumlah Butuh Visit SCO.
* **Donut Chart**: Komposisi kategori kendala reseller.
* **Bar Chart**: Sebaran respon survei per cabang.

### Toolbar Manajemen Layanan Gateway (.BAT)
* **Indikator Live Gateway**: Otomatis mendeteksi status bot:
  * 🟢 `Online (+6281389779977)` jika service aktif.
  * 🔴 `Gateway Offline` jika service belum dijalankan.
* **Panduan Jalankan Gateway**: Penjelasan menjalankan `run_wa_gateway.bat`.
* **Ganti Nomor Bot**: Tombol 1-klik untuk mereset sesi WhatsApp lama agar siap scan QR dengan nomor baru.

---

## 5. Hasil Uji Coba Nyata di Lapangan (Verified Test)

Sistem telah diuji coba secara langsung dari ujung ke ujung (*end-to-end*):
1. **Nomor Bot Pengirim**: `+6281389779977`
2. **Pesan Sapaan Terkirim**: Masuk secara instan ke WhatsApp tujuan pengujian (`085882888808`).
3. **Respon Balasan Nyata**:
   * Pengguna membalas di WhatsApp: `"ga ada saldo"`.
   * Gateway menangkap pesan dan meneruskannya ke Web Report.
   * AI otomatis mengklasifikasikan ke tabel database:
     * **Reseller**: `AR35467` (Angguncell / ANGGUN CELLULAR)
     * **Kategori**: **`KENDALA_SALDO`**
     * **Status**: **`REPLIED`**

---

## 6. Status Deployment & Operasional di Cloud VPS (`https://depas.my.id`)

Fitur Survei Interaktif AI telah **100% TERPASANG DAN AKTIF DI PRODUCTION VPS**:
1. **Node.js 20 LTS** & dependensi Baileys telah terpasang di VPS `45.66.153.150` (Ubuntu 24.04).
2. **Daemon Background Service 24/7 (`wa-gateway.service`)**:
   * Dikelola langsung oleh `systemd` di VPS.
   * Auto-start saat VPS reboot dan auto-recover jika ada gangguan koneksi.
   * Log live service dapat dicek via: `journalctl -u wa-gateway -f`.
3. **Status Sesi WhatsApp Bot**:
   * Sesi login aktif: **`+6281389779977`** (Status: `Online / Standby`).
   * Terhubung langsung ke Web Report API lokal VPS (`http://127.0.0.1:8000/api/survey/incoming-wa`).
4. **Database Sinkron**:
   * SQLite `master_data.db` di VPS telah memuat 25.849 kontak terverifikasi dan tabel log `survey_churn_logs`.

---

## 7. Panduan Operasional Tim Marketing (User Guide)

Tim Marketing dapat langsung mengakses fitur ini dari laptop/HP tanpa instalasi aplikasi teknis apa pun:

1. **Akses Dashboard**:
   * Buka browser dan login ke: **`https://depas.my.id/#survey`**
   * Pastikan badge indikator di kanan atas menampilkan: 🟢 **`Online (+6281389779977)`**.

2. **Langkah Survei Reseller (Tab 1: List Reseller Target)**:
   * **Pilih Reseller**: Telusuri daftar 159 reseller churn bulan ini atau gunakan filter Cabang (BSD, ICON, PP, PRG, ONLINE).
   * **Uji Coba Terlebih Dahulu (Mode Uji Coba)**:
     - Klik tombol **Kirim Survei** pada salah satu baris reseller.
     - Centang kotak **Kirim sebagai uji coba ke nomor ini**.
     - Masukkan nomor HP marketing sendiri.
     - Klik **Kirim Pesan WhatsApp**. Pesan personalisasi akan masuk ke HP marketing untuk diverifikasi formatnya.
   * **Kirim Nyata ke Reseller**:
     - Jangan centang mode uji coba, klik **Kirim Pesan WhatsApp**.
     - Atau centang banyak reseller sekaligus di tabel, lalu klik tombol **Survei AI Batch** di pojok kanan atas.

3. **Memantau Balasan & Kategori AI (Tab 2: Log Survei)**:
   * Setiap kali reseller membalas di WhatsApp, balasan otomatis masuk dalam hitungan detik.
   * AI secara otomatis melabeli kategori kendala (`KENDALA_SALDO`, `KENDALA_HARGA`, `KENDALA_APLIKASI`, `TOKO_TUTUP`, `LAINNYA`) dan menyalakan tanda **Butuh Kunjungan SCO** jika reseller butuh bantuan lapangan.

4. **Melihat Rekapitulasi & KPI (Tab 3: Chart Hasil Survei)**:
   * Menampilkan Response Rate (%), Kendala Dominan, Donut Chart Kategori, dan Bar Chart Sebaran Respon per Cabang untuk bahan laporan mingguan ke manajemen/pimpinan.
