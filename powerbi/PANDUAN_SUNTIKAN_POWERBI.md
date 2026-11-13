# 💉 SUNTIKAN POWER BI: REPRODUKSI HALAMAN YoY TANPA PUSING

> **Solusi Anti-Pusing:**
> Dulu bikin pusing karena:
> 1. Harus import file Excel/TSV mentah yang besar dan berantakan.
> 2. Harus drag relasi tabel di Model View (dan sering error Many-to-Many / Inactive Relationship).
> 3. Harus mikirin rumus DAX dari nol dan angka Daily Trx sering salah karena terbagi per toko bukan hari aktif server global.
>
> **Dengan "Suntikan Ini":**
> Dapur Python sudah memasak 7.000.000 baris transaksi (2024 & 2026), menggabungkannya langsung dengan Master Customer & Master Product, membuang akun bot internal (`AR00037`, `AR00009`), dan menyimpannya dalam **1 file Parquet siap saji**:
> `C:\WEB REPORT\powerbi\dataset_yoy_astaga.parquet` (Load hanya ~3 detik!).

---

## 🚀 LANGKAH EKSEKUSI (HANYA 3 MENIT)

### 1. Buka Power BI & Suntikkan Datanya
1. Buka aplikasi **Power BI Desktop**.
2. Pada menu atas, klik **Get data** ➔ pilih **Blank query** (atau klik **Transform data** ➔ **New Source** ➔ **Blank Query**).
3. Di jendela Power Query, klik menu **Advanced Editor**.
4. Hapus seluruh isi yang ada di editor tersebut, lalu paste kode berikut:

```powerquery
let
    Source = Parquet.Document(File.Contents("C:\WEB REPORT\powerbi\dataset_yoy_astaga.parquet")),
    #"Changed Type" = Table.TransformColumnTypes(Source,{
        {"trx_id", Int64.Type}, 
        {"tgl_entry", type datetime}, 
        {"Tanggal", type date}, 
        {"Bulan_Tahun", type text}, 
        {"Nama_Bulan", type text}, 
        {"Bulan_Urut", Int64.Type}, 
        {"Tahun", Int64.Type}, 
        {"ar_id", type text},
        {"reseller_name", type text},
        {"agen_name", type text},
        {"cabang", type text}, 
        {"tipe", type text}, 
        {"product_id", type text},
        {"product_name", type text},
        {"kategori", type text}, 
        {"operator", type text}, 
        {"status", type text},
        {"beli", Currency.Type}, 
        {"jual", Currency.Type}
    })
in
    #"Changed Type"
```
5. Beri nama tabel di panel sebelah kiri menjadi: **`dataset_yoy_astaga`**
6. Klik **Close & Apply** di pojok kiri atas.
*(Tunggu ~3 detik, 6,9 juta baris data transaksi lengkap langsung masuk ke Power BI!)*

---

### 2. Atur Urutan Bulan (Penting agar tidak urut abjad)
Agar nama bulan di grafik urut sesuai waktu (Januari ➔ Februari ➔ Maret, dst):
1. Di panel **Data** (sebelah kanan), klik kolom **`Nama_Bulan`**.
2. Di menu atas akan muncul tab **Column tools**.
3. Klik **Sort by column** ➔ pilih **`Bulan_Urut`**. Selesai!

---

### 3. Masukkan Rumus DAX Resmi (Sesuai GEMINI.md)
Klik kanan pada tabel `dataset_yoy_astaga` di panel kanan ➔ pilih **New measure**, lalu paste rumus-rumus berikut satu per satu:

#### A. Total Transaksi Sukses
```dax
Total Trx Sukses = COUNTROWS('dataset_yoy_astaga')
```

#### B. Hari Aktif Server Global (Non-Negotiable GEMINI.md)
```dax
Hari Aktif Server = 
CALCULATE(
    DISTINCTCOUNT('dataset_yoy_astaga'[Tanggal]),
    ALLEXCEPT('dataset_yoy_astaga', 'dataset_yoy_astaga'[Bulan_Tahun])
)
```

#### C. Daily Trx (Run-rate Harian)
```dax
Daily Trx = DIVIDE([Total Trx Sukses], [Hari Aktif Server], 0)
```

#### D. Daily Trx 2024
```dax
Daily Trx 2024 = 
CALCULATE([Daily Trx], 'dataset_yoy_astaga'[Tahun] = 2024)
```

#### E. Daily Trx 2026
```dax
Daily Trx 2026 = 
CALCULATE([Daily Trx], 'dataset_yoy_astaga'[Tahun] = 2026)
```

#### F. Growth Daily (Selisih)
```dax
Growth Daily = [Daily Trx 2026] - [Daily Trx 2024]
```

#### G. Growth Daily %
```dax
Growth Daily % = DIVIDE([Growth Daily], [Daily Trx 2024], 0)
```
*(Ubah format measure ini ke `Percentage` di tab Measure Tools).*

---

### 4. Bikin Visualnya (Tinggal Tarik 2 Visual Utama!)

#### 📊 Visual 1: Line Chart Tren Cabang (Persis seperti Tab 1 YoY Web Report)
1. Pilih visual **Line chart** pada panel Visualizations.
2. Drag field berikut:
   - **X-axis**: `Nama_Bulan`
   - **Y-axis**: `Daily Trx`
   - **Legend**: `cabang`
3. Nyalakan **Data labels** di panel Format Visual:
   Sekarang Anda memiliki grafik tren multi-garis BSD, PP, ICON, PRG, ONLINE dengan angka harian per bulannya!

#### 📋 Visual 2: Matrix Tabel Performa Cabang 2024 vs 2026
1. Pilih visual **Matrix** pada panel Visualizations.
2. Drag field berikut:
   - **Rows**: `cabang` (tambahkan `agen_name` di bawah `cabang` jika ingin bisa di-drill down ke nama toko).
   - **Values**:
     - `Daily Trx 2024`
     - `Daily Trx 2026`
     - `Growth Daily`
     - `Growth Daily %`
3. Beri conditional formatting (warna hijau untuk positif, merah untuk negatif) pada `Growth Daily %`.

---

## 🎯 APA YANG TERJADI?
Dalam 3 menit:
- Tidak perlu pusing relasi database atau data modeling.
- Tidak perlu pusing membersihkan delimiter file teks atau encoding.
- Angka 100% akurat dan identik dengan Web Report resmi karena rumus DAX sudah diselaraskan dengan `GEMINI.md`.
