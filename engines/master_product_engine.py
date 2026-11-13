"""
engines/master_product_engine.py
Pusat Kontrol & Database Master Produk Terpadu (SQLite + Parquet).
Mengelola Master Produk ASTAGA & OKIPAY dalam satu database relasional MASTER/master_data.db.

Fitur:
1. Skema database tabel `products` dengan Composite Primary Key (brand, kode_produk).
2. Migrasi awal dari Excel C:\\RAW DATA\\PRODUCT_*.xlsx ke SQLite.
3. Sinkronisasi instan ke Parquet cache (.cache/prod_*.parquet & .cache/prod_full_*.parquet).
4. Operasi CRUD (Query, Search, Filter, Edit Kategori/Operator/Paket).
5. Generator Export Excel (.xlsx) resmi.
"""

import os
import sqlite3
import time
from datetime import datetime
import pandas as pd
import openpyxl

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER_DIR = os.path.join(BASE_DIR, "MASTER")
CACHE_DIR = os.path.join(BASE_DIR, ".cache")
RAW_DATA_ROOT = r"C:\DMS RAW DATA"
DB_PATH = os.path.join(MASTER_DIR, "master_data.db")

_PRICE_STATS_CACHE = {}  # {brand: {"timestamp": float, "stats": dict, "start_date": str, "end_date": str, "total_tx": int}}
_PRICE_CACHE_TTL = 600   # 10 menit TTL


def clear_price_cache(brand: str = None):
    """Membersihkan cache harga 15 hari terakhir."""
    global _PRICE_STATS_CACHE
    if brand:
        _PRICE_STATS_CACHE.pop(brand.upper(), None)
    else:
        _PRICE_STATS_CACHE.clear()


def get_product_price_stats(brand: str = "ASTAGA", days: int = 15) -> dict:
    """
    Menghitung statistik harga modal (beli) & harga jual (jual): min, max, avg, dan total transaksi
    untuk seluruh produk pada 'days' hari terakhir (berdasarkan tgl_entry transaksi sukses).
    Hasil di-cache dalam memori selama TTL agar pencarian dan pagination produk tetap instan (<0.01 detik).
    """
    brand = brand.upper()
    now_ts = time.time()

    cached = _PRICE_STATS_CACHE.get(brand)
    if cached and (now_ts - cached.get("timestamp", 0) < _PRICE_CACHE_TTL):
        return cached

    # Cari file parquet tahun berjalan (2026)
    parquet_path = os.path.join(CACHE_DIR, f"trx_{brand.lower()}_2026.parquet")
    if not os.path.exists(parquet_path):
        empty_res = {"timestamp": now_ts, "stats": {}, "start_date": None, "end_date": None, "total_tx": 0, "days": days}
        _PRICE_STATS_CACHE[brand] = empty_res
        return empty_res

    try:
        # Baca kolom yang dibutuhkan saja untuk efisiensi memori & kecepatan tinggi
        cols = ["tgl_entry", "product_id", "status", "beli", "jual"]
        if brand == "ASTAGA":
            cols.append("ar_id")

        df = pd.read_parquet(parquet_path, columns=cols)
        if df.empty:
            empty_res = {"timestamp": now_ts, "stats": {}, "start_date": None, "end_date": None, "total_tx": 0, "days": days}
            _PRICE_STATS_CACHE[brand] = empty_res
            return empty_res

        # Filter transaksi sukses
        df = df[df["status"].astype(str).str.lower() == "sukses"]

        # Exclude akun internal operasional ASTAGA sesuai hukum GEMINI.md
        if brand == "ASTAGA" and "ar_id" in df.columns:
            df = df[~df["ar_id"].astype(str).str.strip().str.upper().isin(["AR00037", "AR00009", "AR20408"])]

        # Filter harga tidak valid (zero/negative jual)
        df = df[(df["jual"] > 0) & (df["beli"] >= 0)]

        if df.empty:
            empty_res = {"timestamp": now_ts, "stats": {}, "start_date": None, "end_date": None, "total_tx": 0, "days": days}
            _PRICE_STATS_CACHE[brand] = empty_res
            return empty_res

        max_dt = df["tgl_entry"].max()
        # Hitung cut-off days hari kalender penuh
        start_dt = pd.Timestamp(max_dt.date()) - pd.Timedelta(days=days - 1)

        df_15 = df[df["tgl_entry"] >= start_dt]
        total_tx = len(df_15)

        start_date_str = start_dt.strftime("%Y-%m-%d")
        end_date_str = max_dt.strftime("%Y-%m-%d")

        stats_map = {}
        if not df_15.empty:
            agg = df_15.groupby("product_id").agg(
                modal_min=("beli", "min"),
                modal_max=("beli", "max"),
                modal_avg=("beli", "mean"),
                jual_min=("jual", "min"),
                jual_max=("jual", "max"),
                jual_avg=("jual", "mean"),
                trx_count=("jual", "count")
            )
            for pid, r in agg.iterrows():
                p_code = str(pid).strip().upper()
                stats_map[p_code] = {
                    "modal_min": int(r["modal_min"]),
                    "modal_max": int(r["modal_max"]),
                    "modal_avg": int(round(r["modal_avg"])),
                    "jual_min": int(r["jual_min"]),
                    "jual_max": int(r["jual_max"]),
                    "jual_avg": int(round(r["jual_avg"])),
                    "trx_count": int(r["trx_count"])
                }

        res = {
            "timestamp": now_ts,
            "stats": stats_map,
            "start_date": start_date_str,
            "end_date": end_date_str,
            "total_tx": total_tx,
            "days": days
        }
        _PRICE_STATS_CACHE[brand] = res
        return res

    except Exception as e:
        print(f"[WARN] Gagal menghitung harga 15 hari terakhir {brand}: {e}")
        return {"timestamp": now_ts, "stats": {}, "start_date": None, "end_date": None, "total_tx": 0, "days": days}



def get_connection():
    """Membuka koneksi ke SQLite database master."""
    os.makedirs(MASTER_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_product_table():
    """Inisialisasi tabel products di master_data.db."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS products (
                brand TEXT NOT NULL,
                kode_produk TEXT NOT NULL,
                nama_produk TEXT,
                kategori TEXT NOT NULL,
                operator TEXT NOT NULL,
                paket TEXT,
                is_active INTEGER DEFAULT 1,
                updated_at TEXT,
                PRIMARY KEY (brand, kode_produk)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_kategori ON products(brand, kategori);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_operator ON products(brand, operator);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_paket ON products(brand, paket);")
        conn.commit()


def migrate_products():
    """
    Migrasi data awal produk dari file Excel RAW DATA ke SQLite master_data.db.
    """
    print("[MIGRATE-PROD] Memulai migrasi data Master Produk...")
    init_product_table()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 1. ASTAGA
    astaga_path = os.path.join(RAW_DATA_ROOT, "PRODUCT_ASTAGA.xlsx")
    astaga_records = []
    if os.path.exists(astaga_path):
        try:
            wb = openpyxl.load_workbook(astaga_path, read_only=True)
            sheet_name = "Product" if "Product" in wb.sheetnames else wb.sheetnames[0]
            ws = wb[sheet_name]
            for r in ws.iter_rows(min_row=2, values_only=True):
                if r and r[0]:
                    k_prod = str(r[0]).replace("\xa0", "").strip().upper()
                    n_prod = str(r[1]).strip() if len(r) > 1 and r[1] else k_prod
                    kat = str(r[2]).strip().upper() if len(r) > 2 and r[2] else "LAINNYA"
                    op = str(r[3]).strip().upper() if len(r) > 3 and r[3] else "LAINNYA"
                    pkt = str(r[4]).strip().upper() if len(r) > 4 and r[4] else ""
                    astaga_records.append(("ASTAGA", k_prod, n_prod, kat, op, pkt, "REGULER", 1, now_str))
            wb.close()
            print(f"[MIGRATE-PROD] Membaca {len(astaga_records):,} produk ASTAGA dari {astaga_path}.")
        except Exception as e:
            print(f"[WARN] Gagal membaca Excel ASTAGA: {e}")

    # Fallback ke cache parquet ASTAGA jika excel tidak terbaca
    if not astaga_records:
        cache_ast = os.path.join(CACHE_DIR, "prod_full_astaga.parquet")
        if os.path.exists(cache_ast):
            df_ast = pd.read_parquet(cache_ast)
            for _, r in df_ast.iterrows():
                k_prod = str(r.get("product_id", "")).strip().upper()
                n_prod = str(r.get("product_name", k_prod)).strip()
                kat = str(r.get("kategori", "LAINNYA")).strip().upper()
                op = str(r.get("operator", "LAINNYA")).strip().upper()
                pkt = str(r.get("paket", "")).strip().upper()
                astaga_records.append(("ASTAGA", k_prod, n_prod, kat, op, pkt, "REGULER", 1, now_str))

    # 2. OKIPAY
    oki_path = os.path.join(RAW_DATA_ROOT, "PRODUCT_OKI.xlsx")
    oki_records = []
    if os.path.exists(oki_path):
        try:
            wb = openpyxl.load_workbook(oki_path, read_only=True)
            sheet_name = wb.sheetnames[0]
            ws = wb[sheet_name]
            for r in ws.iter_rows(min_row=2, values_only=True):
                if r and r[0]:
                    k_prod = str(r[0]).replace("\xa0", "").strip().upper()
                    n_prod = str(r[1]).strip() if len(r) > 1 and r[1] else k_prod
                    kat = str(r[2]).strip().upper() if len(r) > 2 and r[2] else "LAINNYA"
                    op = str(r[3]).strip().upper() if len(r) > 3 and r[3] else "LAINNYA"
                    pkt = str(r[4]).strip().upper() if len(r) > 4 and r[4] else ""
                    tip = str(r[5]).strip() if len(r) > 5 and r[5] else ""
                    oki_records.append(("OKIPAY", k_prod, n_prod, kat, op, pkt, tip, 1, now_str))
            wb.close()
            print(f"[MIGRATE-PROD] Membaca {len(oki_records):,} produk OKIPAY dari {oki_path}.")
        except Exception as e:
            print(f"[WARN] Gagal membaca Excel OKIPAY: {e}")

    # Fallback ke cache parquet OKIPAY jika excel tidak terbaca
    if not oki_records:
        cache_oki = os.path.join(CACHE_DIR, "prod_full_okipay.parquet")
        if os.path.exists(cache_oki):
            df_oki = pd.read_parquet(cache_oki)
            for _, r in df_oki.iterrows():
                k_prod = str(r.get("product_id", "")).strip().upper()
                n_prod = str(r.get("product_name", k_prod)).strip()
                kat = str(r.get("kategori", "LAINNYA")).strip().upper()
                op = str(r.get("operator", "LAINNYA")).strip().upper()
                pkt = str(r.get("paket", "")).strip().upper()
                tip = str(r.get("tipe_produk", "")).strip()
                oki_records.append(("OKIPAY", k_prod, n_prod, kat, op, pkt, tip, 1, now_str))

    # Simpan ke SQLite
    with get_connection() as conn:
        cursor = conn.cursor()
        if astaga_records:
            cursor.executemany("""
                INSERT OR REPLACE INTO products (
                    brand, kode_produk, nama_produk, kategori, operator, paket, tipe_produk, is_active, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, astaga_records)
        if oki_records:
            cursor.executemany("""
                INSERT OR REPLACE INTO products (
                    brand, kode_produk, nama_produk, kategori, operator, paket, tipe_produk, is_active, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, oki_records)
        conn.commit()

    print(f"[MIGRATE-PROD] Sukses: {len(astaga_records):,} ASTAGA & {len(oki_records):,} OKIPAY tersimpan di SQLite!")
    sync_to_parquet("ALL")


def sync_to_parquet(brand: str = "ALL"):
    """
    Ekspor master produk dari SQLite ke Parquet cache (.cache/prod_*.parquet & prod_full_*.parquet)
    sehingga fungsi product_engine.get_product_map() bisa membaca secara instan (<0.005s).
    """
    brands = ["ASTAGA", "OKIPAY"] if brand == "ALL" else [brand.upper()]
    os.makedirs(CACHE_DIR, exist_ok=True)

    with get_connection() as conn:
        for b in brands:
            # 1. prod_{b.lower()}.parquet (Mapping cepat product_id -> kategori, operator, & paket as tipe_produk)
            df_short = pd.read_sql_query("""
                SELECT kode_produk AS product_id, kategori, operator,
                       COALESCE(NULLIF(TRIM(paket), ''), 'REGULER') AS tipe_produk
                FROM products
                WHERE brand = ? AND is_active = 1
                ORDER BY kode_produk
            """, conn, params=(b,))
            out_short = os.path.join(CACHE_DIR, f"prod_{b.lower()}.parquet")
            df_short.to_parquet(out_short, index=False)

            # 2. prod_full_{b.lower()}.parquet (Kolom lengkap untuk Analisa/Pivot)
            df_full = pd.read_sql_query("""
                SELECT kode_produk AS product_id, nama_produk AS product_name,
                       kategori, operator, paket
                FROM products
                WHERE brand = ? AND is_active = 1
                ORDER BY kode_produk
            """, conn, params=(b,))
            out_full = os.path.join(CACHE_DIR, f"prod_full_{b.lower()}.parquet")
            df_full.to_parquet(out_full, index=False)

            print(f"[SYNC-PROD] Parquet {b} berhasil diperbarui: {len(df_short):,} produk tersimpan.")

    # Invalidate in-memory cache
    try:
        import engines.product_engine as pe
        pe.clear_cache()
    except Exception:
        pass


def get_filter_options(brand: str = "ASTAGA") -> dict:
    """Mengambil list kategori, operator, paket dan ringkasan metrik statistik."""
    brand = brand.upper()
    with get_connection() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT DISTINCT kategori FROM products 
            WHERE brand = ? AND kategori IS NOT NULL AND kategori != ''
            ORDER BY kategori
        """, (brand,))
        categories = [r[0] for r in cursor.fetchall()]

        cursor.execute("""
            SELECT DISTINCT operator FROM products 
            WHERE brand = ? AND operator IS NOT NULL AND operator != ''
            ORDER BY operator
        """, (brand,))
        operators = [r[0] for r in cursor.fetchall()]

        cursor.execute("""
            SELECT DISTINCT paket FROM products 
            WHERE brand = ? AND paket IS NOT NULL AND paket != ''
            ORDER BY paket
        """, (brand,))
        pakets = [r[0] for r in cursor.fetchall()]

        cursor.execute("""
            SELECT DISTINCT nama_produk, operator, kategori 
            FROM products 
            WHERE brand = ? AND nama_produk IS NOT NULL AND nama_produk != ''
            ORDER BY nama_produk
        """, (brand,))
        nama_providers = [{"nama": r[0], "operator": r[1], "kategori": r[2]} for r in cursor.fetchall()]

        cursor.execute("SELECT COUNT(*) FROM products WHERE brand = ?", (brand,))
        total_products = cursor.fetchone()[0]

        cursor.execute("""
            SELECT COUNT(*) FROM products 
            WHERE brand = ? AND (kategori IS NULL OR kategori = '' OR kategori = 'LAINNYA')
        """, (brand,))
        unmapped_kat = cursor.fetchone()[0]

        return {
            "categories": categories,
            "operators": operators,
            "pakets": pakets,
            "nama_providers": nama_providers,
            "stats": {
                "total_products": total_products,
                "total_categories": len(categories),
                "total_operators": len(operators),
                "total_nama_providers": len(nama_providers),
                "unmapped_categories": unmapped_kat
            }
        }


def query_products(
    brand: str = "ASTAGA",
    kategori: str = None,
    operator: str = None,
    nama_provider: str = None,
    paket: str = None,
    search: str = None,
    sort_by: str = "kode_produk",
    sort_dir: str = "ASC",
    page: int = 1,
    page_size: int = 25
) -> dict:
    """Query daftar produk dengan filter, pencarian, statistik harga 15 hari terakhir, dan pagination."""
    brand = brand.upper()
    page = max(1, page)
    page_size = max(1, min(100, page_size))
    offset = (page - 1) * page_size

    # Ambil statistik harga 15 hari terakhir (dari cache RAM instan)
    price_info = get_product_price_stats(brand=brand, days=15)
    price_map = price_info.get("stats", {})

    where_clauses = ["brand = ?"]
    params = [brand]

    if kategori and kategori != "ALL":
        where_clauses.append("kategori = ?")
        params.append(kategori)

    if operator and operator != "ALL":
        where_clauses.append("operator = ?")
        params.append(operator)

    if nama_provider and nama_provider != "ALL":
        np = nama_provider.strip()
        where_clauses.append("nama_produk = ?")
        params.append(np)

    if paket and paket != "ALL":
        where_clauses.append("paket = ?")
        params.append(paket)

    if search and search.strip():
        s = f"%{search.strip()}%"
        where_clauses.append("(kode_produk LIKE ? OR nama_produk LIKE ?)")
        params.extend([s, s])

    where_sql = " AND ".join(where_clauses)

    sort_by_clean = (sort_by or "kode_produk").strip().lower()
    sort_dir_clean = "DESC" if (sort_dir or "ASC").strip().upper() == "DESC" else "ASC"

    # Kolom database yang bisa di-sort langsung di SQL
    db_sortable = {
        "kode_produk": "kode_produk",
        "nama_produk": "nama_produk",
        "kategori": "kategori",
        "operator": "operator",
        "paket": "paket"
    }

    with get_connection() as conn:
        cursor = conn.cursor()

        # Total matching
        cursor.execute(f"SELECT COUNT(*) FROM products WHERE {where_sql}", tuple(params))
        total_count = cursor.fetchone()[0]

        if sort_by_clean in db_sortable:
            # Sort langsung di SQLite
            sql_col = db_sortable[sort_by_clean]
            sql = f"""
                SELECT kode_produk, nama_produk, kategori, operator, paket, is_active, updated_at
                FROM products
                WHERE {where_sql}
                ORDER BY {sql_col} {sort_dir_clean}, kode_produk ASC
                LIMIT ? OFFSET ?
            """
            cursor.execute(sql, tuple(params + [page_size, offset]))
            fetched_rows = cursor.fetchall()

            rows = []
            for r in fetched_rows:
                k_code = str(r["kode_produk"]).strip().upper()
                p_stat = price_map.get(k_code, {})
                rows.append({
                    "kode_produk": r["kode_produk"],
                    "nama_produk": r["nama_produk"] or r["kode_produk"],
                    "kategori": r["kategori"] or "LAINNYA",
                    "operator": r["operator"] or "LAINNYA",
                    "paket": r["paket"] or "-",
                    "is_active": r["is_active"],
                    "modal_min": p_stat.get("modal_min"),
                    "modal_max": p_stat.get("modal_max"),
                    "modal_avg": p_stat.get("modal_avg"),
                    "jual_min": p_stat.get("jual_min"),
                    "jual_max": p_stat.get("jual_max"),
                    "jual_avg": p_stat.get("jual_avg"),
                    "trx_count_15d": p_stat.get("trx_count", 0)
                })
        else:
            # Sort berdasarkan metrik harga di Python
            sql = f"""
                SELECT kode_produk, nama_produk, kategori, operator, paket, is_active, updated_at
                FROM products
                WHERE {where_sql}
            """
            cursor.execute(sql, tuple(params))
            all_rows = []
            for r in cursor.fetchall():
                k_code = str(r["kode_produk"]).strip().upper()
                p_stat = price_map.get(k_code, {})
                m_avg = p_stat.get("modal_avg")
                j_avg = p_stat.get("jual_avg")
                margin = (j_avg - m_avg) if (j_avg is not None and m_avg is not None) else None
                all_rows.append({
                    "kode_produk": r["kode_produk"],
                    "nama_produk": r["nama_produk"] or r["kode_produk"],
                    "kategori": r["kategori"] or "LAINNYA",
                    "operator": r["operator"] or "LAINNYA",
                    "paket": r["paket"] or "-",
                    "is_active": r["is_active"],
                    "modal_min": p_stat.get("modal_min"),
                    "modal_max": p_stat.get("modal_max"),
                    "modal_avg": m_avg,
                    "jual_min": p_stat.get("jual_min"),
                    "jual_max": p_stat.get("jual_max"),
                    "jual_avg": j_avg,
                    "margin": margin,
                    "trx_count_15d": p_stat.get("trx_count", 0)
                })

            is_desc = (sort_dir_clean == "DESC")
            # Sort key helper: None ditaruh di paling belakang
            def sort_key(item):
                val = item.get(sort_by_clean)
                if val is None:
                    return (1, 0)
                return (0, -val if is_desc else val)

            all_rows.sort(key=sort_key)
            rows = all_rows[offset : offset + page_size]

        total_pages = (total_count + page_size - 1) // page_size

        return {
            "brand": brand,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "sort_by": sort_by_clean,
            "sort_dir": sort_dir_clean,
            "date_range_15d": {
                "start": price_info.get("start_date"),
                "end": price_info.get("end_date"),
                "days": price_info.get("days", 15),
                "total_tx": price_info.get("total_tx", 0)
            },
            "rows": rows
        }


def suggest_product_meta(brand: str, kode_produk: str) -> dict:
    """Mencari rekomendasi nama, kategori, operator, dan paket berdasarkan kemiripan prefix kode."""
    brand = brand.upper()
    code = (kode_produk or "").strip().upper()
    if not code:
        return None
    with get_connection() as conn:
        cursor = conn.cursor()
        for length in range(len(code), 1, -1):
            prefix = code[:length]
            cursor.execute("""
                SELECT nama_produk, kategori, operator, paket 
                FROM products 
                WHERE brand = ? AND kode_produk LIKE ? 
                ORDER BY LENGTH(kode_produk) ASC, kode_produk ASC LIMIT 1
            """, (brand, f"{prefix}%"))
            row = cursor.fetchone()
            if row:
                return {
                    "nama_produk": row[0],
                    "kategori": row[1],
                    "operator": row[2],
                    "paket": row[3],
                    "matched_prefix": prefix
                }
    return None


def get_product_detail(brand: str, kode_produk: str) -> dict:
    """Mengambil profil lengkap produk berdasarkan kode beserta harga 15 hari terakhir."""
    brand = brand.upper()
    kode_produk = kode_produk.strip().upper()

    price_info = get_product_price_stats(brand=brand, days=15)
    price_map = price_info.get("stats", {})
    prod_price = price_map.get(kode_produk)

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM products WHERE brand = ? AND kode_produk = ?", (brand, kode_produk))
        prod = cursor.fetchone()
        if not prod:
            suggestion = suggest_product_meta(brand, kode_produk)
            return {"found": False, "suggestion": suggestion, "price_stats_15d": prod_price}

        return {
            "found": True,
            "product": dict(prod),
            "price_stats_15d": prod_price,
            "date_range_15d": {
                "start": price_info.get("start_date"),
                "end": price_info.get("end_date"),
                "days": 15
            }
        }


def save_product(brand: str, kode_produk: str, data: dict) -> dict:
    """Menyimpan atau memperbarui data produk di database & menyelaraskan Parquet."""
    brand = brand.upper()
    kode_produk = kode_produk.strip().upper()
    nama_produk = data.get("nama_produk", "").strip() or kode_produk
    kategori = data.get("kategori", "LAINNYA").strip().upper()
    operator = data.get("operator", "LAINNYA").strip().upper()
    paket = data.get("paket", "").strip().upper()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO products (
                brand, kode_produk, nama_produk, kategori, operator, paket, is_active, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        """, (brand, kode_produk, nama_produk, kategori, operator, paket, now_str))
        conn.commit()

    # Refresh Parquet cache
    sync_to_parquet(brand)
    
    # Invalidate in-memory caches
    try:
        import engines.product_engine as pe
        pe.clear_cache()
    except Exception:
        pass

    try:
        import engines.overview_engine as oe
        oe.clear_unmapped_cache()
    except Exception:
        pass
    
    return {"ok": True, "kode_produk": kode_produk, "kategori": kategori, "operator": operator}


def export_product_excel(brand: str) -> str:
    """Meng-generate file Excel master produk dari database SQLite lengkap dengan statistik harga 15 hari terakhir."""
    brand = brand.upper()
    export_filename = f"MASTER_PRODUCT_{brand}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    export_path = os.path.join(MASTER_DIR, export_filename)

    price_info = get_product_price_stats(brand=brand, days=15)
    price_map = price_info.get("stats", {})

    with get_connection() as conn:
        df_prod = pd.read_sql_query("""
            SELECT kode_produk AS [Kode Produk], nama_produk AS [Nama Produk],
                   kategori AS [Kategori], operator AS [Operator], paket AS [Paket / Jenis Produk]
            FROM products WHERE brand = ? ORDER BY kode_produk
        """, conn, params=(brand,))

    df_prod["Modal Min (15H)"] = df_prod["Kode Produk"].apply(lambda c: price_map.get(str(c).upper(), {}).get("modal_min"))
    df_prod["Modal Max (15H)"] = df_prod["Kode Produk"].apply(lambda c: price_map.get(str(c).upper(), {}).get("modal_max"))
    df_prod["Modal Avg (15H)"] = df_prod["Kode Produk"].apply(lambda c: price_map.get(str(c).upper(), {}).get("modal_avg"))
    df_prod["Jual Min (15H)"] = df_prod["Kode Produk"].apply(lambda c: price_map.get(str(c).upper(), {}).get("jual_min"))
    df_prod["Jual Max (15H)"] = df_prod["Kode Produk"].apply(lambda c: price_map.get(str(c).upper(), {}).get("jual_max"))
    df_prod["Jual Avg (15H)"] = df_prod["Kode Produk"].apply(lambda c: price_map.get(str(c).upper(), {}).get("jual_avg"))
    df_prod["Trx Sukses (15H)"] = df_prod["Kode Produk"].apply(lambda c: price_map.get(str(c).upper(), {}).get("trx_count", 0))

    with pd.ExcelWriter(export_path, engine="openpyxl") as writer:
        df_prod.to_excel(writer, sheet_name="Product", index=False)

    return export_path



def get_module_type_map(brand: str = None) -> dict:
    """Mendapatkan mapping {modul_id: tipe_modul ('CHIP'/'H2H')} dari master_data.db."""
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            if brand and brand.upper() not in ["ALL", "GABUNGAN"]:
                cursor.execute("SELECT modul_id, tipe_modul FROM modules WHERE brand = ?", (brand.upper(),))
            else:
                cursor.execute("SELECT modul_id, tipe_modul FROM modules")
            return {r[0]: r[1] for r in cursor.fetchall()}
    except Exception:
        return {}


if __name__ == "__main__":
    migrate_products()
