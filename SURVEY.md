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

## 6. Kesiapan Deployment ke VPS (`https://depas.my.id`)

Agar fitur ini bisa digunakan oleh tim Marketing dari mana saja lewat browser web:
1. **Node.js 20 LTS** telah berhasil diinstal di sistem VPS `45.66.153.150` (Ubuntu 24.04).
2. Kode frontend (`pages/survey`) dan backend (`survey_engine.py`) sudah siap di-push dan di-sync ke VPS.
3. Di VPS, WhatsApp Gateway akan dijalankan sebagai background daemon service 24/7 (`wa-gateway.service`), sehingga bot selalu siaga menerima dan mengirim chat tanpa bergantung pada laptop kantor.
4. Sesi login nomor bot `+6281389779977` yang sudah tersimpan di lokal dapat langsung disinkronkan ke VPS tanpa perlu scan QR ulang.
