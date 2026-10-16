"""
engines/system_engine.py
Engine pendukung Modul Sistem & Pengaturan (#settings).
Menyediakan status data freshness, kesehatan master data, audit integritas, dan pre-warm status.
"""

import os
import datetime
import pandas as pd
import engines.transaction_engine as trx_engine
import engines.customer_engine as cust_engine
import engines.product_engine as prod_engine

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER_DIR = os.path.join(BASE_DIR, "MASTER")
CACHE_DIR = os.path.join(BASE_DIR, ".cache")
SCO_DIR = os.path.join(BASE_DIR, "pages", "sco")

MONTH_NAMES_ID = {
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
    "05": "Mei", "06": "Jun", "07": "Jul", "08": "Agu",
    "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
}


def _format_datetime(dt) -> str:
    if not dt or pd.isna(dt):
        return "-"
    if isinstance(dt, str):
        try:
            dt = pd.to_datetime(dt)
        except Exception:
            return dt
    # Format: 04 Okt 2026, 23:59:46 WIB
    day = dt.strftime("%d")
    month_code = dt.strftime("%m")
    month_name = MONTH_NAMES_ID.get(month_code, dt.strftime("%b"))
    year = dt.strftime("%Y")
    time_str = dt.strftime("%H:%M:%S")
    return f"{day} {month_name} {year}, {time_str} WIB"


def _format_file_mtime(filepath: str) -> str:
    if not os.path.exists(filepath):
        return "-"
    mtime = os.path.getmtime(filepath)
    dt = datetime.datetime.fromtimestamp(mtime)
    day = dt.strftime("%d")
    month_code = dt.strftime("%m")
    month_name = MONTH_NAMES_ID.get(month_code, dt.strftime("%b"))
    year = dt.strftime("%Y")
    time_str = dt.strftime("%H:%M:%S")
    return f"{day} {month_name} {year}, {time_str} WIB"


def _format_file_size(filepath: str) -> str:
    if not os.path.exists(filepath):
        return "0 KB"
    sz = os.path.getsize(filepath)
    if sz >= 1024 * 1024:
        return f"{sz / (1024 * 1024):.2f} MB"
    return f"{sz / 1024:.1f} KB"


_OVERVIEW_CACHE = {}

def get_system_overview(year: str = "2026") -> dict:
    """
    Mengambil data status sistem terpadu:
    1. Data Freshness & Cut-Off per Brand (ASTAGA, OKIPAY)
    2. Master Data Health & Integrity Checks
    3. Cache File Footprint & Status
    4. Versi dan Informasi Platform
    """
    p_astaga = os.path.join(CACHE_DIR, f"trx_astaga_{year}.parquet")
    p_okipay = os.path.join(CACHE_DIR, f"trx_okipay_{year}.parquet")
    mtime_astaga = os.path.getmtime(p_astaga) if os.path.exists(p_astaga) else 0
    mtime_okipay = os.path.getmtime(p_okipay) if os.path.exists(p_okipay) else 0
    cache_key = (year, mtime_astaga, mtime_okipay)

    if cache_key in _OVERVIEW_CACHE:
        return _OVERVIEW_CACHE[cache_key]

    brands_data = {}
    total_trx_all = 0
    total_sukses_all = 0

    # 1. Analisa Transaksi & Freshness
    for brand in ["ASTAGA", "OKIPAY"]:
        try:
            df = trx_engine.load(brand, year)
            if df is not None and not df.empty:
                max_tgl = df["tgl_entry"].max()
                min_tgl = df["tgl_entry"].min()
                total_rows = len(df)
                if "is_sukses" in df.columns:
                    sukses_rows = int(df["is_sukses"].sum())
                else:
                    sukses_rows = int(df["status"].astype(str).str.lower().str.contains("sukses", na=False).sum())
                
                total_trx_all += total_rows
                total_sukses_all += sukses_rows

                periods = sorted([str(ym) for ym in df["ym"].dropna().unique().tolist()])
                period_labels = [f"{MONTH_NAMES_ID.get(p.split('-')[1], p.split('-')[1])} {p.split('-')[0]}" for p in periods]

                # Master checks (gunakan unique array agar 100x lebih cepat daripada scan 1.5M baris string)
                cust_map = cust_engine.get_ar_to_cabang(brand)
                prod_map = prod_engine.get_product_map(brand)

                unique_ar = df["ar_id"].dropna().unique()
                trx_ar = set(str(x).strip().upper() for x in unique_ar)
                known_ar = set(cust_map.keys())
                unmapped_ar = len(trx_ar - known_ar)

                unique_prod = df["product_id"].dropna().unique()
                trx_prod = set(str(x).strip().upper() for x in unique_prod)
                known_prod = set(k.upper() for k in prod_map.keys())
                unmapped_prod = len(trx_prod - known_prod)

                brands_data[brand] = {
                    "brand": brand,
                    "status": "Online",
                    "total_rows": total_rows,
                    "sukses_rows": sukses_rows,
                    "min_date": _format_datetime(min_tgl),
                    "cut_off_date": _format_datetime(max_tgl),
                    "active_periods": period_labels,
                    "unique_reseller_trx": len(trx_ar),
                    "master_reseller_count": len(known_ar),
                    "unmapped_reseller": unmapped_ar,
                    "unique_prod_trx": len(trx_prod),
                    "master_prod_count": len(known_prod),
                    "unmapped_prod": unmapped_prod,
                    "is_healthy": (unmapped_ar == 0 and unmapped_prod == 0)
                }
            else:
                brands_data[brand] = {
                    "brand": brand,
                    "status": "No Data",
                    "total_rows": 0,
                    "sukses_rows": 0,
                    "min_date": "-",
                    "cut_off_date": "-",
                    "active_periods": [],
                    "unique_reseller_trx": 0,
                    "master_reseller_count": 0,
                    "unmapped_reseller": 0,
                    "unique_prod_trx": 0,
                    "master_prod_count": 0,
                    "unmapped_prod": 0,
                    "is_healthy": False
                }
        except Exception as e:
            brands_data[brand] = {
                "brand": brand,
                "status": f"Error: {str(e)}",
                "is_healthy": False
            }

    # 2. Master Files Audit (Live Dynamic Counts from SQLite)
    db_master_path = os.path.join(MASTER_DIR, "master_data.db")
    role_agents_resellers = "Customer Master (SQLite)"
    role_products = "Product Master (SQLite)"
    role_branches = "10 Cabang Resmi & Depo Regional"

    if os.path.exists(db_master_path):
        try:
            import sqlite3
            with sqlite3.connect(db_master_path) as conn:
                cur = conn.cursor()
                cur.execute("SELECT count(*) FROM resellers")
                tot_res = cur.fetchone()[0]
                cur.execute("SELECT count(*) FROM agents")
                tot_ag = cur.fetchone()[0]
                role_agents_resellers = f"{tot_res:,} Downline Reseller & {tot_ag:,} Agen Induk".replace(",", ".")

                cur.execute("SELECT brand, count(*) FROM products GROUP BY brand")
                prod_map = dict(cur.fetchall())
                astaga_p = prod_map.get("ASTAGA", 0)
                okipay_p = prod_map.get("OKIPAY", 0)
                tot_p = astaga_p + okipay_p
                role_products = f"{tot_p:,} SKU Produk (ASTAGA {astaga_p:,} & OKIPAY {okipay_p:,})".replace(",", ".")
        except Exception:
            pass

    master_files_to_check = [
        {
            "name": "master_data.db",
            "category": "Master Database Hub",
            "path": os.path.join(MASTER_DIR, "master_data.db"),
            "role": "Database Terpadu Master Customer & Master Produk (SQLite)",
            "cache_file": os.path.join(CACHE_DIR, "prod_astaga.parquet")
        },
        {
            "name": "Tabel: agents & resellers",
            "category": "Customer Master (SQLite)",
            "path": os.path.join(MASTER_DIR, "master_data.db"),
            "role": role_agents_resellers,
            "cache_file": os.path.join(CACHE_DIR, "cust_astaga.parquet")
        },
        {
            "name": "Tabel: products",
            "category": "Product Master (SQLite)",
            "path": os.path.join(MASTER_DIR, "master_data.db"),
            "role": role_products,
            "cache_file": os.path.join(CACHE_DIR, "prod_astaga.parquet")
        },
        {
            "name": "Tabel: branches",
            "category": "Wilayah & Cabang (SQLite)",
            "path": os.path.join(MASTER_DIR, "master_data.db"),
            "role": role_branches,
            "cache_file": os.path.join(CACHE_DIR, "cust_okipay.parquet")
        },
        {
            "name": "Parquet Caches (ASTAGA & OKIPAY)",
            "category": "High-Speed Cache",
            "path": os.path.join(CACHE_DIR, "cust_full_astaga.parquet"),
            "role": "Cache Kolumnar Cepat (Customer & Produk)",
            "cache_file": os.path.join(CACHE_DIR, "prod_full_astaga.parquet")
        },
        {
            "name": "KPI_SCO.xlsx",
            "category": "Target & KPI",
            "path": os.path.join(SCO_DIR, "KPI_SCO.xlsx"),
            "role": "Master Target Bulanan SCO (Jan - Sep 2026)",
            "cache_file": os.path.join(SCO_DIR, "data_sco.json")
        }
    ]

    master_status = []
    for mf in master_files_to_check:
        p = mf["path"]
        exists = os.path.exists(p)
        cp = mf["cache_file"]
        cache_exists = os.path.exists(cp)
        is_synced = False

        if exists and cache_exists:
            # Synced if cache exists and db exists
            is_synced = True

        master_status.append({
            "name": mf["name"],
            "category": mf["category"],
            "role": mf["role"],
            "exists": exists,
            "size": _format_file_size(p) if exists else "0 KB",
            "last_modified": _format_file_mtime(p) if exists else "-",
            "cache_synced": is_synced,
            "status_badge": "Optimal" if is_synced else ("Tersedia" if exists else "Hilang")
        })

    # 3. Available Branches
    all_cabangs = sorted(list(set(
        cust_engine.get_cabang_list("ASTAGA") + cust_engine.get_cabang_list("OKIPAY")
    )))

    res = {
        "app_info": {
            "name": "Web Report BI & Analytics",
            "version": "v2.4 (2026 Edition)",
            "engine": "Fast Parquet Vectorized RAM Engine",
            "author": "Depo Cell Business Intelligence",
            "branding": "Google Analytics Material Standard"
        },
        "summary": {
            "total_transactions": total_trx_all,
            "total_success": total_sukses_all,
            "success_rate": f"{(total_sukses_all / total_trx_all * 100):.1f}%" if total_trx_all > 0 else "0%"
        },
        "brands": brands_data,
        "master_files": master_status,
        "branches": all_cabangs
    }
    _OVERVIEW_CACHE[cache_key] = res
    return res
