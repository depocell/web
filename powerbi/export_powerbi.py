"""
export_powerbi.py
=================
Generator dataset Power BI mandiri yang menyatukan Fact Transaksi (2024 & 2026),
Dim Customer, dan Dim Product ke dalam 1 file Parquet siap saji:
powerbi/dataset_yoy_astaga.parquet

Optimized for ultra-fast execution (<15 seconds for 7M rows).
"""

import os
import time
import pandas as pd
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, ".cache")
POWERBI_DIR = os.path.join(BASE_DIR, "powerbi")
OUT_FILE = os.path.join(POWERBI_DIR, "dataset_yoy_astaga.parquet")

EXCLUDE_ACCOUNTS = {'AR00037', 'AR00009', 'AR20408'}

def export_dataset():
    t0 = time.time()
    os.makedirs(POWERBI_DIR, exist_ok=True)
    print("=" * 60)
    print("🚀 EXPORT DATASET POWER BI - ASTAGA YOY")
    print("=" * 60)

    # 1. Dim Customer & Product
    cust_file = os.path.join(CACHE_DIR, "cust_full_astaga.parquet")
    prod_file = os.path.join(CACHE_DIR, "prod_full_astaga.parquet")
    
    print("[1/4] Membaca Master Dimensi Customer & Product...")
    df_cust = pd.read_parquet(cust_file)[['ar_id', 'reseller_name', 'group', 'agen_name', 'tipe', 'cabang']]
    df_prod = pd.read_parquet(prod_file)[['product_id', 'product_name', 'kategori', 'operator']]

    # 2. Fact Transactions
    t26_file = os.path.join(CACHE_DIR, "trx_astaga_2026.parquet")
    t24_file = os.path.join(CACHE_DIR, "trx_astaga_2024.parquet")

    cols_trx = ['trx_id', 'tgl_entry', 'product_id', 'ar_id', 'status', 'beli', 'jual', '_source_file']
    
    print("[2/4] Membaca Transaksi 2026 & 2024...")
    df_26 = pd.read_parquet(t26_file)[cols_trx].copy()
    df_26['Tahun'] = np.int16(2026)

    df_24 = pd.read_parquet(t24_file)[cols_trx].copy()
    df_24['Tahun'] = np.int16(2024)

    df_all = pd.concat([df_26, df_24], ignore_index=True)
    del df_26, df_24
    print(f"      Total Transaksi Gabungan: {len(df_all):,} baris")

    # Impute NaT dates from _source_file if any (e.g. 0224.xlsx -> 2024-02-15)
    mask_nat = df_all['tgl_entry'].isna()
    if mask_nat.any():
        print(f"      Memperbaiki {mask_nat.sum():,} baris tanggal kosong dari source file...")
        # 0224.xlsx -> 2024-02-15
        df_all.loc[mask_nat & (df_all['_source_file'] == '0224.xlsx'), 'tgl_entry'] = pd.Timestamp('2024-02-15 12:00:00')
        # Drop any remaining unfixable NaT
        df_all = df_all.dropna(subset=['tgl_entry'])

    # 3. Filtering
    print("[3/4] Filter Transaksi Sukses & Exclude Akun Internal...")
    mask = (df_all['status'] == 'Sukses') & (~df_all['ar_id'].isin(EXCLUDE_ACCOUNTS))
    df_all = df_all[mask].copy()
    print(f"      Transaksi Valid: {len(df_all):,} baris")

    # Merge Dimensions
    df_all = df_all.merge(df_cust, on='ar_id', how='left')
    df_all['cabang'] = df_all['cabang'].fillna('LAINNYA')
    df_all['tipe'] = df_all['tipe'].fillna('Non Limit')

    df_all = df_all.merge(df_prod, on='product_id', how='left')
    df_all['kategori'] = df_all['kategori'].fillna('LAINNYA')
    df_all['operator'] = df_all['operator'].fillna('LAINNYA')

    # Vectorized fast date processing
    print("[4/4] Memproses Metadata Tanggal & Kalender (Vectorized)...")
    # Date as timestamp at 00:00:00 (native pyarrow date support)
    df_all['Tanggal'] = df_all['tgl_entry'].dt.floor('D')
    
    # Bulan_Urut as int32
    year = df_all['tgl_entry'].dt.year.astype(np.int32)
    month = df_all['tgl_entry'].dt.month.astype(np.int32)
    df_all['Bulan_Urut'] = (year * 100 + month).astype(np.int32)

    # Fast string mapping
    month_names = {
        1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'Mei', 6: 'Jun',
        7: 'Jul', 8: 'Agu', 9: 'Sep', 10: 'Okt', 11: 'Nov', 12: 'Des'
    }
    month_str = month.map(lambda m: f"{m:02d}")
    df_all['Bulan_Tahun'] = year.astype(str) + '-' + month_str
    
    short_year = (year % 100).astype(str)
    df_all['Nama_Bulan'] = month.map(month_names) + " '" + short_year

    # Hapus kolom temporer _source_file
    if '_source_file' in df_all.columns:
        df_all.drop(columns=['_source_file'], inplace=True)

    # Simpan ke Parquet
    print(f"💾 Menulis ke Parquet: {OUT_FILE}...")
    df_all.to_parquet(OUT_FILE, index=False, compression='snappy')
    size_mb = os.path.getsize(OUT_FILE) / (1024 * 1024)

    dur = time.time() - t0
    print("=" * 60)
    print(f"✅ SUKSES! {len(df_all):,} baris tersimpan ke {OUT_FILE}")
    print(f"📦 Ukuran File: {size_mb:.2f} MB | Durasi: {dur:.2f} detik")
    print("=" * 60)

if __name__ == '__main__':
    export_dataset()
