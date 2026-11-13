r"""
sync_tujuan.py
Engine Sinkronisasi Nomor Tujuan Transaksi OtomaX ke SQLite (trx_tujuan) dan Cache Parquet.
Membaca file tujuan (misal tujuan0110.tsv, tujuan0210.tsv, dst) dari folder:
C:\DMS RAW DATA\TRANSAKSI\ASTAGA\CSV\BULANAN\2026\INSERT TUJUAN\
Lalu secara otomatis menyambungkannya ke:
1. Tabel SQLite trx_tujuan di MASTER/master_data.db
2. File cache parquet bulanan (.cache/parts/astaga_2026_1026.parquet)
3. File cache parquet tahunan (.cache/trx_astaga_2026.parquet)
4. Mirror parquet di C:\DMS RAW DATA\TRANSAKSI\ASTAGA\PARQUET\
"""

import os
import glob
import time
import pandas as pd
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(BASE_DIR, ".cache")
INSERT_TUJUAN_DIR = r"C:\DMS RAW DATA\TRANSAKSI\ASTAGA\CSV\BULANAN\2026\INSERT TUJUAN"

import engines.fraud_engine as fe
import engines.admin_engine as admin_engine

def sync_tujuan_all(brand: str = "ASTAGA", year: str = "2026") -> dict:
    brand = (brand or "ASTAGA").strip().upper()
    year = str(year or "2026")
    t0 = time.time()
    
    print(f"\n[SYNC TUJUAN] Memulai sinkronisasi nomor tujuan {brand} {year}...")
    
    # 1. Deteksi dan impor file TSV tujuan dari folder INSERT TUJUAN dan sekitarnya
    res_import = fe.auto_import_pending_tujuan_files(brand)
    
    # Periksa juga folder khusus INSERT TUJUAN jika belum ter-cover
    if os.path.exists(INSERT_TUJUAN_DIR):
        for f in glob.glob(os.path.join(INSERT_TUJUAN_DIR, "*.tsv")):
            fname = os.path.basename(f)
            if not any(r.get("filename") == fname for r in res_import):
                res = fe.import_trx_tujuan_from_file(f, brand)
                if res.get("ok"):
                    res_import.append(res)
                    
    print(f"[SYNC TUJUAN] File tujuan terimpor: {len(res_import)}")
    for r in res_import:
        print(f"  - {r.get('filename')}: {r.get('rows_imported', 0):,} baris")

    # 2. Ambil seluruh pemetaan trx_id -> tujuan dari database SQLite trx_tujuan
    conn = fe.get_db_connection()
    df_tt = pd.read_sql_query("SELECT trx_id, tujuan FROM trx_tujuan WHERE brand = ?", conn, params=[brand])
    conn.close()

    if df_tt.empty:
        msg = f"Tabel trx_tujuan {brand} masih kosong. Tidak ada data yang disinkronkan."
        print(f"[WARN] {msg}")
        return {"ok": False, "message": msg, "total_patched": 0}

    t_map = dict(zip(df_tt['trx_id'].astype('int64'), df_tt['tujuan'].astype(str).str.strip()))
    print(f"[SYNC TUJUAN] Total database mapping trx_tujuan: {len(t_map):,} baris")

    # 3. Patch mini-cache parquet di .cache/parts/
    parts_dir = os.path.join(CACHE_DIR, "parts")
    pattern = os.path.join(parts_dir, f"{brand.lower()}_{year}_*.parquet")
    part_files = glob.glob(pattern)

    updated_any = False
    total_patched = 0
    updated_files = []

    for pf in part_files:
        df_part = pd.read_parquet(pf)
        if "trx_id" not in df_part.columns:
            continue

        if "tujuan" not in df_part.columns:
            df_part["tujuan"] = None

        null_mask = df_part["tujuan"].isna() | df_part["tujuan"].astype(str).str.strip().isin(["", "nan", "None"])
        if not null_mask.any():
            continue

        # Map tujuan berdasarkan trx_id
        mapped = df_part.loc[null_mask, "trx_id"].astype("int64").map(t_map)
        valid_mapped = mapped[mapped.notna() & (mapped.astype(str).str.strip() != "")]

        if not valid_mapped.empty:
            df_part.loc[valid_mapped.index, "tujuan"] = valid_mapped
            df_part.to_parquet(pf, index=False)
            cnt = len(valid_mapped)
            total_patched += cnt
            updated_any = True
            updated_files.append(os.path.basename(pf))
            print(f"  [PARQUET UPDATED] {os.path.basename(pf)}: +{cnt:,} nomor tujuan tersambung!")

    # 4. Update combined parquet tahunan jika ada part yang berubah
    combined_path = os.path.join(CACHE_DIR, f"trx_{brand.lower()}_{year}.parquet")
    if updated_any and os.path.exists(combined_path):
        df_comb = pd.read_parquet(combined_path)
        if "tujuan" not in df_comb.columns:
            df_comb["tujuan"] = None
        c_null_mask = df_comb["tujuan"].isna() | df_comb["tujuan"].astype(str).str.strip().isin(["", "nan", "None"])
        if c_null_mask.any():
            c_mapped = df_comb.loc[c_null_mask, "trx_id"].astype("int64").map(t_map)
            c_valid = c_mapped[c_mapped.notna() & (c_mapped.astype(str).str.strip() != "")]
            if not c_valid.empty:
                df_comb.loc[c_valid.index, "tujuan"] = c_valid
                df_comb.to_parquet(combined_path, index=False)
                print(f"  [COMBINED UPDATED] trx_{brand.lower()}_{year}.parquet: +{len(c_valid):,} nomor tujuan!")

        # Mirror ke DMS
        admin_engine.mirror_parquet_to_dms(brand, year, combined_path)

    # 5. Reset RAM Cache fraud & tren ewallet agar kalkulasi baru langsung aktif
    if hasattr(fe, "_FRAUD_CACHE"):
        fe._FRAUD_CACHE.clear()
    if hasattr(fe, "_TREN_EWALLET_CACHE"):
        fe._TREN_EWALLET_CACHE.clear()

    elapsed = round(time.time() - t0, 2)
    print(f"[SYNC TUJUAN] Sukses dalam {elapsed}s! Total {total_patched:,} baris transaksi baru tersambung.\n")

    return {
        "ok": True,
        "brand": brand,
        "year": year,
        "files_scanned": len(res_import),
        "imported_files": res_import,
        "total_mapping_sqlite": len(t_map),
        "total_patched": total_patched,
        "updated_files": updated_files,
        "elapsed_seconds": elapsed
    }

if __name__ == "__main__":
    sync_tujuan_all()
