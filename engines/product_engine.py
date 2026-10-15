"""
engines/product_engine.py
Membaca dan menyediakan mapping master produk dari database SQLite (MASTER/master_data.db)
dan Parquet cache (.cache/prod_*.parquet) untuk ASTAGA dan OKIPAY.
100% mandiri tanpa ketergantungan pada file Excel.
"""

import os
import pandas as pd

BASE_DIR   = os.path.dirname(os.path.dirname(__file__))
MASTER_DIR = os.path.join(BASE_DIR, "MASTER")
CACHE_DIR  = os.path.join(BASE_DIR, ".cache")
DB_PATH    = os.path.join(MASTER_DIR, "master_data.db")

_PROD_MAP: dict[str, dict] = {}


def get_product_map(brand: str) -> dict:
    """
    Kembalikan dict {product_id: {'kategori': ..., 'operator': ...}}
    Membaca dari in-memory cache RAM -> Parquet cache -> SQLite master_data.db.
    """
    brand = brand.upper()
    if brand in _PROD_MAP:
        return _PROD_MAP[brand]

    p_cache = os.path.join(CACHE_DIR, f"prod_{brand.lower()}.parquet")
    db_mtime = os.path.getmtime(DB_PATH) if os.path.exists(DB_PATH) else 0

    # 1. Coba baca dari cache Parquet jika up-to-date (<0.005s)
    if os.path.exists(p_cache) and (db_mtime == 0 or os.path.getmtime(p_cache) >= db_mtime):
        try:
            df_cache = pd.read_parquet(p_cache)
            if "product_id" in df_cache.columns and "tipe_produk" in df_cache.columns:
                pids = df_cache["product_id"].tolist()
                kats = df_cache["kategori"].tolist()
                ops  = df_cache["operator"].tolist()
                tips = df_cache["tipe_produk"].tolist()
                mapping = {p: {"kategori": k, "operator": o, "tipe_produk": t} for p, k, o, t in zip(pids, kats, ops, tips)}
                _PROD_MAP[brand] = mapping
                return mapping
        except Exception:
            pass

    # 2. Coba baca dari database SQLite master_data.db
    if os.path.exists(DB_PATH):
        try:
            import sqlite3
            conn = sqlite3.connect(DB_PATH)
            query = """
                SELECT kode_produk AS product_id, kategori, operator,
                       COALESCE(NULLIF(TRIM(paket), ''), 'REGULER') AS tipe_produk
                FROM products
                WHERE brand = ? AND is_active = 1
                ORDER BY kode_produk
            """
            df_db = pd.read_sql_query(query, conn, params=(brand,))
            conn.close()

            if not df_db.empty:
                os.makedirs(CACHE_DIR, exist_ok=True)
                df_db.to_parquet(p_cache, index=False)

                pids = df_db["product_id"].tolist()
                kats = df_db["kategori"].tolist()
                ops  = df_db["operator"].tolist()
                tips = df_db["tipe_produk"].tolist()
                mapping = {p: {"kategori": k, "operator": o, "tipe_produk": t} for p, k, o, t in zip(pids, kats, ops, tips)}
                _PROD_MAP[brand] = mapping
                return mapping
        except Exception as e:
            print(f"[WARN] Gagal membaca master produk dari SQLite: {e}")

    # Fallback kosong jika database belum siap
    _PROD_MAP[brand] = {}
    return {}


def clear_cache():
    """Reset in-memory cache saat produk diupdate."""
    _PROD_MAP.clear()
