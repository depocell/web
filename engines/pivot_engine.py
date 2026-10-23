"""
pivot_engine.py
Engine Pivot Table Dinamis:
Menggabungkan data transaksi (parquet) dengan master customer (reseller & agen)
untuk komputasi multidimensi real-time.
"""

from typing import Dict, Any, List, Optional
import os
import time
import pandas as pd
import numpy as np
import importlib
import engines.transaction_engine as te
import engines.metrics_engine as me
try:
    importlib.reload(me)
except Exception:
    pass
import engines.profit_engine as pe_profit
try:
    importlib.reload(pe_profit)
except Exception:
    pass

BASE_DIR   = os.path.dirname(os.path.dirname(__file__))
MASTER_DIR = os.path.join(BASE_DIR, "MASTER")

CACHE_DIR  = os.path.join(BASE_DIR, ".cache")

_CUST_CACHE: Dict[str, pd.DataFrame] = {}
_CUST_MTIME: Dict[str, float] = {}
_PROD_CACHE: Dict[str, pd.DataFrame] = {}
_PROD_MTIME: Dict[str, float] = {}
_TRX_PREP_CACHE: Dict[str, Dict[str, Any]] = {}

def clear_cache():
    """Reset seluruh cache memori di pivot engine."""
    _CUST_CACHE.clear()
    _CUST_MTIME.clear()
    _PROD_CACHE.clear()
    _PROD_MTIME.clear()
    _TRX_PREP_CACHE.clear()

def get_customer_df(brand: str) -> pd.DataFrame:
    """Load and cache customer master with relevant analysis columns using fast parquet cache or SQLite."""
    brand = brand.upper()
    db_path = os.path.join(MASTER_DIR, "master_data.db")
    p_cache = os.path.join(CACHE_DIR, f"cust_full_{brand.lower()}.parquet")
    db_mtime = os.path.getmtime(db_path) if os.path.exists(db_path) else 0
    p_mtime = os.path.getmtime(p_cache) if os.path.exists(p_cache) else 0
    curr_mtime = max(db_mtime, p_mtime)

    if brand in _CUST_CACHE and _CUST_MTIME.get(brand, 0) >= curr_mtime and curr_mtime > 0:
        return _CUST_CACHE[brand]

    if os.path.exists(p_cache) and (db_mtime == 0 or p_mtime >= db_mtime):
        try:
            df = pd.read_parquet(p_cache)
            _CUST_CACHE[brand] = df
            _CUST_MTIME[brand] = curr_mtime
            return df
        except Exception:
            pass

    # 1. Coba baca dari database SQLite master_data.db
    if os.path.exists(db_path):
        try:
            import sqlite3
            conn = sqlite3.connect(db_path)
            query = """
                SELECT 
                    r.kode_reseller AS ar_id,
                    r.nama_reseller AS reseller_name,
                    r.grup AS [group],
                    r.root_agen_id AS agen_id,
                    COALESCE(a.nama_agen, r.root_agen_id) AS agen_name,
                    COALESCE(a.type, 'Standard') AS tipe,
                    COALESCE(r.cabang, a.cabang) AS cabang
                FROM resellers r
                LEFT JOIN agents a ON a.brand = r.brand AND a.agen_id = r.root_agen_id
                WHERE r.brand = ?
            """
            cust_df = pd.read_sql_query(query, conn, params=(brand,))
            conn.close()
            if not cust_df.empty:
                os.makedirs(CACHE_DIR, exist_ok=True)
                cust_df.to_parquet(p_cache, index=False)
                _CUST_CACHE[brand] = cust_df
                _CUST_MTIME[brand] = os.path.getmtime(p_cache)
                return cust_df
        except Exception as e:
            print(f"[WARN] pivot_engine SQLite read error: {e}")

    # 2. Fallback lama ke Excel jika DB tidak ada
    file_name = "CUSTOMER_ASTAGA.xlsx" if brand == "ASTAGA" else "CUSTOMER_OKI.xlsx"
    path = os.path.join(MASTER_DIR, file_name)
    if not os.path.exists(path):
        return pd.DataFrame()

    try:
        engine_list = ["calamine", "openpyxl"]
        df_r, df_a = pd.DataFrame(), pd.DataFrame()
        for eng in engine_list:
            try:
                with pd.ExcelFile(path, engine=eng) as wb:
                    s_res = next((s for s in wb.sheet_names if "reseller" in s.lower()), None)
                    s_agen = next((s for s in wb.sheet_names if "agen" in s.lower()), None)
                    if s_res: df_r = pd.read_excel(wb, sheet_name=s_res)
                    if s_agen: df_a = pd.read_excel(wb, sheet_name=s_agen)
                if not df_r.empty: break
            except Exception:
                continue

        df_r.columns = [str(c).strip() for c in df_r.columns]
        if not df_a.empty:
            df_a.columns = [str(c).strip() for c in df_a.columns]

        # Ambil kolom yang relevan dari Reseller
        keep_map = {
            "Kode Reseller": "ar_id",
            "Reseller Name": "reseller_name",
            "Group": "group",
            "Agen id": "agen_id",
            "Agen Name": "agen_name",
            "Tipe": "tipe",
            "Cabang": "cabang"
        }
        res_cols = {}
        for orig, target in keep_map.items():
            found = next((c for c in df_r.columns if c.lower() == orig.lower()), None)
            if found:
                res_cols[found] = target

        cust_df = df_r[list(res_cols.keys())].rename(columns=res_cols)
        for c in cust_df.columns:
            cust_df[c] = cust_df[c].fillna("").astype(str).str.strip().str.replace("\xa0", "", regex=False)
        cust_df["ar_id"] = cust_df["ar_id"].str.upper()

        # Buat mapping Agen ID -> CABANG & Agen Name dari sheet Agen jika di reseller kosong
        if not df_a.empty:
            a_id_col = next((c for c in df_a.columns if "agen id" in c.lower() or "agen_id" in c.lower()), None)
            a_cab_col = next((c for c in df_a.columns if c.lower() == "cabang"), None)
            a_name_col = next((c for c in df_a.columns if "agen name" in c.lower() or "agen_name" in c.lower()), None)

            clean_aids = df_a[a_id_col].fillna("").astype(str).str.strip().str.replace("\xa0", "", regex=False).str.upper() if a_id_col else pd.Series()
            if a_cab_col and not clean_aids.empty:
                a_cabs = df_a[a_cab_col].fillna("").astype(str).str.strip().str.replace("\xa0", "", regex=False)
                map_cab = dict(zip(clean_aids, a_cabs))
                cust_df["cabang"] = cust_df["cabang"].where(cust_df["cabang"].ne(""), cust_df["agen_id"].str.upper().map(map_cab).fillna(""))
            if a_name_col and not clean_aids.empty and "agen_name" in cust_df.columns:
                a_names = df_a[a_name_col].fillna("").astype(str).str.strip().str.replace("\xa0", "", regex=False)
                map_name = dict(zip(clean_aids, a_names))
                cust_df["agen_name"] = cust_df["agen_name"].where(cust_df["agen_name"].ne(""), cust_df["agen_id"].str.upper().map(map_name).fillna(""))

        # Khusus jika agen_name masih kosong (seperti di OKIPAY), map Agen ID -> Reseller Name dari master Reseller
        if "agen_name" in cust_df.columns:
            empty_mask = cust_df["agen_name"].isna() | (cust_df["agen_name"].str.strip() == "")
            if empty_mask.any():
                id_to_name = dict(zip(cust_df["ar_id"], cust_df["reseller_name"]))
                derived_name = cust_df["agen_id"].str.upper().map(id_to_name).fillna(cust_df["agen_id"])
                cust_df["agen_name"] = cust_df["agen_name"].where(~empty_mask, cust_df["agen_id"] + " - " + derived_name)

        # Fallback untuk tipe jika kosong (ambil dari kolom Leveling jika ada di df_r)
        if "tipe" in cust_df.columns:
            empty_tipe = cust_df["tipe"].isna() | (cust_df["tipe"].str.strip() == "")
            leveling_col = next((c for c in df_r.columns if "leveling" in c.lower()), None)
            if empty_tipe.any() and leveling_col:
                cust_df["tipe"] = cust_df["tipe"].where(~empty_tipe, df_r[leveling_col].fillna("").astype(str).str.strip())

        cust_df = cust_df.drop_duplicates("ar_id")
        
        # Save to parquet cache
        os.makedirs(CACHE_DIR, exist_ok=True)
        cust_df.to_parquet(p_cache, index=False)

        _CUST_CACHE[brand] = cust_df
        return cust_df
    except Exception as e:
        print(f"[ERROR] Gagal memuat customer {brand}: {e}")
        return pd.DataFrame()


def get_product_df(brand: str) -> pd.DataFrame:
    """Load and cache full product master (Kode, Nama, Kategori, Operator, Paket, Type) dari Parquet / SQLite."""
    brand = brand.upper()
    db_path = os.path.join(MASTER_DIR, "master_data.db")
    p_cache = os.path.join(CACHE_DIR, f"prod_full_{brand.lower()}.parquet")
    db_mtime = os.path.getmtime(db_path) if os.path.exists(db_path) else 0
    p_mtime = os.path.getmtime(p_cache) if os.path.exists(p_cache) else 0
    curr_mtime = max(db_mtime, p_mtime)

    if brand in _PROD_CACHE and _PROD_MTIME.get(brand, 0) >= curr_mtime and curr_mtime > 0 and not _PROD_CACHE[brand].empty:
        return _PROD_CACHE[brand]

    if os.path.exists(p_cache):
        try:
            df = pd.read_parquet(p_cache)
            _PROD_CACHE[brand] = df
            _PROD_MTIME[brand] = curr_mtime
            return df
        except Exception:
            pass

    # Fallback ke SQLite master_data.db
    if os.path.exists(db_path):
        try:
            import sqlite3
            with sqlite3.connect(db_path) as conn:
                df = pd.read_sql_query("""
                    SELECT kode_produk AS product_id,
                           nama_produk AS product_name,
                           kategori,
                           operator,
                           paket
                    FROM products
                    WHERE brand = ? AND is_active = 1
                """, conn, params=(brand,))
                for c in df.columns:
                    df[c] = df[c].fillna("").astype(str).str.strip()
                os.makedirs(CACHE_DIR, exist_ok=True)
                df.to_parquet(p_cache, index=False)
                _PROD_CACHE[brand] = df
                _PROD_MTIME[brand] = os.path.getmtime(p_cache)
                return df
        except Exception as e:
            print(f"[ERROR] Gagal memuat master produk {brand} dari SQLite: {e}")

    return pd.DataFrame()


def get_prepared_trx(brand: str, year: str = "2026") -> pd.DataFrame:
    """Load transaction data with precomputed columns cached in-memory."""
    brand = brand.upper()
    cache_key = f"{brand}_{year}"
    path = te._cache_path(brand, year)
    mtime = os.path.getmtime(path) if os.path.exists(path) else 0

    if cache_key in _TRX_PREP_CACHE and _TRX_PREP_CACHE[cache_key]["mtime"] == mtime:
        return _TRX_PREP_CACHE[cache_key]["df"]

    df = te.load(brand, year)
    if brand == "ASTAGA":
        df = me.filter_astaga_internal(df)

    if "ym" not in df.columns:
        df["ym"] = df["tgl_entry"].dt.to_period("M").astype(str)
    df["tanggal"] = df["tgl_entry"].dt.date.astype(str)
    df["bulan"] = df["ym"]
    df["ar_id_clean"] = df["ar_id"].astype(str).str.strip().str.upper()
    df["product_id_clean"] = df["product_id"].astype(str).str.strip().str.upper()

    markup_map = pe_profit.get_reseller_markup_map(brand)
    df["markup"] = df["ar_id_clean"].map(markup_map).fillna(0.0)
    df["base_price"] = me.calculate_server_base_price(df["jual"], df["markup"])
    df["net_profit"] = me.calculate_net_profit(df["jual"], df["beli"], df["markup"])
    df["margin"] = df["net_profit"]

    if "is_sukses" in df.columns:
        df["is_sukses_num"] = df["is_sukses"].astype(int)
    else:
        df["is_sukses_num"] = df["status"].astype(str).str.lower().str.contains("sukses", na=False).astype(int)

    _TRX_PREP_CACHE[cache_key] = {"mtime": mtime, "df": df}
    return df


OPERATIONAL_METRICS_IDS = {"trx_count", "daily_trx", "sukses_pct"}

def get_options(brand: str = "ASTAGA", year: str = "2026", pivot_type: str = "channel", mode: str = "operational") -> Dict[str, Any]:
    """Kembalikan opsi dropdown dimensi, metrik, dan filter yang tersedia."""
    brand = brand.upper()
    pivot_type = pivot_type.lower()
    df_trx = get_prepared_trx(brand, year)
    cust_df = get_customer_df(brand)
    prod_df = get_product_df(brand)

    months = sorted(df_trx["ym"].dropna().unique().tolist(), reverse=True)
    statuses = sorted(df_trx["status"].dropna().astype(str).unique().tolist())
    cabangs = sorted(cust_df["cabang"].dropna().unique().tolist()) if not cust_df.empty else []

    kategoris = sorted([k for k in prod_df["kategori"].dropna().unique().tolist() if k and k != "UNKNOWN"]) if not prod_df.empty else []
    operators = sorted([o for o in prod_df["operator"].dropna().unique().tolist() if o and o != "UNKNOWN"]) if not prod_df.empty else []

    metrics = [
        {"id": "trx_count", "label": "Jumlah Transaksi (Count)", "is_curr": False},
        {"id": "daily_trx", "label": "Daily Trx (Trx / Hari)", "is_curr": False},
        {"id": "base_price_avg", "label": "Harga Jual Dasar Server (Rata-rata / Hit)", "is_curr": True},
        {"id": "net_arpu", "label": "Net ARPU (Revenue Bersih / Trx Sukses)", "is_curr": True},
        {"id": "margin_pct", "label": "Net Margin % (Net Profit / Harga Dasar)", "is_curr": False},
        {"id": "margin_sum", "label": "Total Net Profit Server (Rp)", "is_curr": True},
        {"id": "daily_margin", "label": "Daily Net Profit Server (Rp / Hari)", "is_curr": True},
        {"id": "base_price_sum", "label": "Total Revenue Bersih Server (Rp)", "is_curr": True},
        {"id": "jual_sum", "label": "Total Omzet Jual Kotor (Rp)", "is_curr": True},
        {"id": "daily_jual", "label": "Daily Omzet Jual Kotor (Rp / Hari)", "is_curr": True},
        {"id": "beli_sum", "label": "Total Modal Beli (Rp)", "is_curr": True},
        {"id": "qty_sum", "label": "Total Qty Volume (Sum)", "is_curr": False},
        {"id": "sukses_pct", "label": "Success Rate (% Sukses)", "is_curr": False}
    ]

    # Filter metrik jika dalam mode operasional (non-profit untuk staf/publik)
    if str(mode).strip().lower() not in ("financial", "management", "admin", "full"):
        metrics = [m for m in metrics if m["id"] in OPERATIONAL_METRICS_IDS]

    if pivot_type == "product":
        dimensions = [
            {"id": "kategori", "label": "Kategori Produk"},
            {"id": "operator", "label": "Operator / Provider"},
            {"id": "paket", "label": "Paket / Jenis Produk"},
            {"id": "product_name", "label": "Nama Produk"},
            {"id": "product_id", "label": "Kode Produk (ID)"},
            {"id": "modul_id", "label": "Modul Suplier"},
            {"id": "cabang", "label": "Cabang / Channel"},
            {"id": "agen_name", "label": "Induk / Agen (Group ID)"},
            {"id": "reseller_name", "label": "Nama Reseller"},
            {"id": "tipe", "label": "Tipe Reseller"},
            {"id": "group", "label": "Group Reseller"},
            {"id": "status", "label": "Status Transaksi"},
            {"id": "bulan", "label": "Bulan (YYYY-MM)"},
            {"id": "tanggal", "label": "Tanggal (YYYY-MM-DD)"}
        ]
        column_dimensions = [
            {"id": "none", "label": "-- Tanpa Kolom (1 Dimensi) --"},
            {"id": "kategori", "label": "Kategori Produk"},
            {"id": "operator", "label": "Operator / Provider"},
            {"id": "cabang", "label": "Cabang / Channel"},
            {"id": "tipe", "label": "Tipe Reseller"},
            {"id": "status", "label": "Status Transaksi"},
            {"id": "bulan", "label": "Bulan"},
            {"id": "modul_id", "label": "Modul Suplier"}
        ]
    else:
        dimensions = [
            {"id": "cabang", "label": "Cabang / Channel"},
            {"id": "agen_name", "label": "Induk / Agen (Group ID)"},
            {"id": "reseller_name", "label": "Nama Reseller"},
            {"id": "ar_id", "label": "Kode Reseller (AR_ID)"},
            {"id": "group", "label": "Group Reseller"},
            {"id": "tipe", "label": "Tipe Reseller"},
            {"id": "kategori", "label": "Kategori Produk"},
            {"id": "operator", "label": "Operator / Provider"},
            {"id": "modul_id", "label": "Modul Suplier"},
            {"id": "status", "label": "Status Transaksi"},
            {"id": "bulan", "label": "Bulan (YYYY-MM)"},
            {"id": "tanggal", "label": "Tanggal (YYYY-MM-DD)"}
        ]
        column_dimensions = [
            {"id": "none", "label": "-- Tanpa Kolom (1 Dimensi) --"},
            {"id": "status", "label": "Status Transaksi"},
            {"id": "kategori", "label": "Kategori Produk"},
            {"id": "operator", "label": "Operator / Provider"},
            {"id": "bulan", "label": "Bulan"},
            {"id": "cabang", "label": "Cabang"},
            {"id": "tipe", "label": "Tipe Reseller"},
            {"id": "group", "label": "Group Reseller"},
            {"id": "modul_id", "label": "Modul Suplier"}
        ]

    return {
        "brand": brand,
        "year": year,
        "pivot_type": pivot_type,
        "months": months,
        "statuses": statuses,
        "cabangs": cabangs,
        "kategoris": kategoris,
        "operators": operators,
        "years": te.get_available_years(brand),
        "dimensions": dimensions,
        "column_dimensions": column_dimensions,
        "metrics": metrics
    }


def execute_pivot(
    brand: str = "ASTAGA",
    year: str = "2026",
    row_dim: str = "cabang",
    col_dim: str = "none",
    metric: str = "trx_count",
    month_filter: str = "ALL",
    status_filter: str = "ALL",
    cabang_filter: str = "ALL",
    kategori_filter: str = "ALL",
    operator_filter: str = "ALL",
    top_limit: int = 100,
    mode: str = "operational"
) -> Dict[str, Any]:
    """Eksekusi kalkulasi pivot table dinamis untuk Channel & Product."""
    t0 = time.time()
    brand = brand.upper()

    # Validasi metrik sesuai mode (cegah akses metrik profit jika mode operasional)
    if str(mode).strip().lower() not in ("financial", "management", "admin", "full"):
        if metric not in OPERATIONAL_METRICS_IDS:
            metric = "trx_count"

    df = get_prepared_trx(brand, year)

    # 1. Filter Global
    if month_filter and month_filter != "ALL":
        df = df[df["ym"] == month_filter]
    if status_filter and status_filter != "ALL":
        df = df[df["status"] == status_filter]

    # 2. Merge dengan Customer Master jika dimensi membutuhkan customer data
    cust_dims = {"cabang", "agen_name", "reseller_name", "group", "tipe"}
    needs_cust = (row_dim in cust_dims) or (col_dim in cust_dims) or (cabang_filter != "ALL")
    
    if needs_cust:
        cust_df = get_customer_df(brand)
        if not cust_df.empty:
            df = df.merge(cust_df, left_on="ar_id_clean", right_on="ar_id", how="left")
        for c in ["cabang", "agen_name", "reseller_name", "group", "tipe"]:
            if c in df.columns:
                df[c] = df[c].fillna("UNKNOWN").astype(str)
            else:
                df[c] = "UNKNOWN"

    if cabang_filter and cabang_filter != "ALL" and "cabang" in df.columns:
        df = df[df["cabang"] == cabang_filter]

    # 3. Merge dengan Product Master jika dimensi membutuhkan data produk
    prod_dims = {"kategori", "operator", "paket", "product_name", "product_id"}
    needs_prod = (row_dim in prod_dims) or (col_dim in prod_dims) or (kategori_filter != "ALL") or (operator_filter != "ALL")

    if needs_prod:
        prod_df = get_product_df(brand)
        if not prod_df.empty:
            # Gunakan kolom selain product_id agar tidak konflik dengan kolom transaksi
            merge_cols = [c for c in prod_df.columns if c in ["product_name", "kategori", "operator", "paket"]]
            df = df.merge(prod_df[["product_id"] + merge_cols], left_on="product_id_clean", right_on="product_id", how="left", suffixes=("", "_master"))
        for c in ["kategori", "operator", "paket", "product_name"]:
            if c in df.columns:
                df[c] = df[c].fillna("LAINNYA").astype(str)
            else:
                df[c] = "LAINNYA"

    if kategori_filter and kategori_filter != "ALL" and "kategori" in df.columns:
        df = df[df["kategori"] == kategori_filter]
    if operator_filter and operator_filter != "ALL" and "operator" in df.columns:
        df = df[df["operator"] == operator_filter]

    if df.empty:
        return {
            "columns": [row_dim.upper()],
            "rows": [],
            "totals": {},
            "total_records": 0,
            "elapsed_ms": round((time.time() - t0) * 1000, 1)
        }

    days_per_month = df.groupby("ym")["tanggal"].nunique().to_dict()
    active_days = me.get_active_days(df, date_col="tgl_entry")

    # Summary Stats
    total_trx = len(df)
    sukses_cnt = int(df["is_sukses_num"].sum())
    overall_sukses_rate = round((sukses_cnt / total_trx * 100), 2) if total_trx > 0 else 0.0

    is_financial = str(mode).strip().lower() in ("financial", "management", "admin", "full")

    if is_financial:
        total_jual = float(df["jual"].sum())
        total_base_price = float(df["base_price"].sum())
        total_margin = float(df["margin"].sum())
        overall_net_arpu = me.calculate_net_arpu(total_base_price, sukses_cnt)
        overall_margin_pct = me.calculate_margin_pct(total_margin, total_base_price)

        summary = {
            "active_days": active_days,
            "total_trx": total_trx,
            "daily_trx": me.calculate_daily_rate(total_trx, active_days),
            "total_jual": round(total_jual, 0),
            "daily_jual": round(me.calculate_daily_rate(total_jual, active_days), 0),
            "total_base_price": round(total_base_price, 0),
            "total_margin": round(total_margin, 0),
            "daily_margin": round(me.calculate_daily_rate(total_margin, active_days), 0),
            "sukses_rate": overall_sukses_rate,
            "net_arpu": overall_net_arpu,
            "margin_pct": overall_margin_pct
        }
    else:
        summary = {
            "active_days": active_days,
            "total_trx": total_trx,
            "daily_trx": me.calculate_daily_rate(total_trx, active_days),
            "sukses_rate": overall_sukses_rate
        }

    # Metric configuration
    is_daily = metric in ("daily_trx", "daily_jual", "daily_margin")

    if metric in ("trx_count", "daily_trx"):
        val_col = "trx_id"
        agg_fn = "count"
    elif metric in ("jual_sum", "daily_jual"):
        val_col = "jual"
        agg_fn = "sum"
    elif metric in ("margin_sum", "daily_margin"):
        val_col = "margin"
        agg_fn = "sum"
    elif metric == "base_price_sum":
        val_col = "base_price"
        agg_fn = "sum"
    elif metric == "base_price_avg":
        val_col = "base_price"
        agg_fn = "mean"
    elif metric == "beli_sum":
        val_col = "beli"
        agg_fn = "sum"
    elif metric == "qty_sum":
        val_col = "qty"
        agg_fn = "sum"
    elif metric == "sukses_pct":
        val_col = "is_sukses_num"
        agg_fn = "mean"
    elif metric in ("net_arpu", "margin_pct"):
        val_col = "base_price"
        agg_fn = "sum"
    else:
        val_col = "trx_id"
        agg_fn = "count"

    # 4. Pivot / Aggregation
    if col_dim and col_dim != "none" and col_dim != row_dim:
        # 2D Pivot Table
        if metric == "net_arpu":
            df_suk = df[df["is_sukses_num"] == 1]
            piv_rev = pd.pivot_table(
                df_suk, index=row_dim, columns=col_dim, values="base_price", aggfunc="sum", fill_value=0, margins=True, margins_name="TOTAL"
            ).astype(float)
            piv_cnt = pd.pivot_table(
                df_suk, index=row_dim, columns=col_dim, values="trx_id", aggfunc="count", fill_value=0, margins=True, margins_name="TOTAL"
            ).astype(float)
            piv = piv_rev.divide(piv_cnt.replace(0, np.nan)).fillna(0.0)
        elif metric == "margin_pct":
            piv_prof = pd.pivot_table(
                df, index=row_dim, columns=col_dim, values="margin", aggfunc="sum", fill_value=0, margins=True, margins_name="TOTAL"
            ).astype(float)
            piv_rev = pd.pivot_table(
                df, index=row_dim, columns=col_dim, values="base_price", aggfunc="sum", fill_value=0, margins=True, margins_name="TOTAL"
            ).astype(float)
            piv = (piv_prof.divide(piv_rev.replace(0, np.nan)) * 100.0).fillna(0.0)
        else:
            piv = pd.pivot_table(
                df,
                index=row_dim,
                columns=col_dim,
                values=val_col,
                aggfunc=agg_fn,
                fill_value=0,
                margins=True,
                margins_name="TOTAL"
            ).astype(float)

            if metric == "sukses_pct":
                piv = piv * 100.0
            elif is_daily:
                if col_dim == "bulan":
                    for c in piv.columns:
                        c_str = str(c)
                        if c_str in days_per_month:
                            piv[c] = piv[c] / float(max(days_per_month[c_str], 1))
                        elif c_str == "TOTAL":
                            piv[c] = piv[c] / float(active_days)
                elif row_dim == "bulan":
                    for r in piv.index:
                        r_str = str(r)
                        if r_str in days_per_month:
                            piv.loc[r] = piv.loc[r] / float(max(days_per_month[r_str], 1))
                        elif r_str == "TOTAL":
                            piv.loc[r] = piv.loc[r] / float(active_days)
                elif col_dim == "tanggal":
                    for c in piv.columns:
                        if str(c) == "TOTAL":
                            piv[c] = piv[c] / float(active_days)
                elif row_dim == "tanggal":
                    for r in piv.index:
                        if str(r) == "TOTAL":
                            piv.loc[r] = piv.loc[r] / float(active_days)
                else:
                    piv = piv / float(active_days)

        # Sort baris: jika dimensi waktu (bulan/tanggal), urutkan kronologis; selain itu urutkan berdasarkan TOTAL descending
        if "TOTAL" in piv.index:
            total_row_s = piv.loc["TOTAL"].copy()
            piv_data = piv.drop(index="TOTAL")
            if row_dim in ("bulan", "tanggal"):
                piv_data = piv_data.sort_index(ascending=True)
            else:
                piv_data = piv_data.sort_values(by="TOTAL", ascending=False).head(top_limit)
        else:
            total_row_s = pd.Series(dtype=float)
            if row_dim in ("bulan", "tanggal"):
                piv_data = piv_data.sort_index(ascending=True)
            else:
                piv_data = piv_data.sort_values(by=piv.columns[0], ascending=False).head(top_limit)

        col_headers = [str(c) for c in piv_data.columns]
        if col_dim in ("bulan", "tanggal") and "TOTAL" in col_headers:
            data_cols = [c for c in col_headers if c != "TOTAL"]
            data_cols.sort()
            col_headers = data_cols + ["TOTAL"]
            piv_data = piv_data[col_headers]
        rows_data = []

        for idx_val, r_s in piv_data.iterrows():
            row_dict = {"_row_label": str(idx_val)}
            for col_h in col_headers:
                row_dict[col_h] = round(float(r_s.get(col_h, 0.0)), 2)
            rows_data.append(row_dict)

        total_dict = {"_row_label": "TOTAL"}
        for col_h in col_headers:
            total_dict[col_h] = round(float(total_row_s.get(col_h, 0.0)), 2)

        return {
            "is_2d": True,
            "row_dim": row_dim,
            "col_dim": col_dim,
            "columns": col_headers,
            "rows": rows_data,
            "total_row": total_dict,
            "summary": summary,
            "elapsed_ms": round((time.time() - t0) * 1000, 1)
        }

    else:
        # 1D Breakdown Table
        agg_kwargs = {
            "trx_count": ("trx_id", "count"),
            "qty_sum": ("qty", "sum"),
            "sukses_count": ("is_sukses_num", "sum")
        }
        if is_financial:
            agg_kwargs.update({
                "jual_sum": ("jual", "sum"),
                "base_price_sum": ("base_price", "sum"),
                "beli_sum": ("beli", "sum"),
                "margin_sum": ("margin", "sum"),
            })

        grp = df.groupby(row_dim).agg(**agg_kwargs)
        grp["sukses_pct"] = np.where(grp["trx_count"] > 0, (grp["sukses_count"] / grp["trx_count"] * 100.0), 0.0)

        if is_financial:
            grp["base_price_avg"] = np.where(grp["trx_count"] > 0, grp["base_price_sum"] / grp["trx_count"], 0.0)
            grp["net_arpu"] = np.where(grp["sukses_count"] > 0, grp["base_price_sum"] / grp["sukses_count"], 0.0)
            grp["margin_pct"] = np.where(grp["base_price_sum"] > 0, (grp["margin_sum"] / grp["base_price_sum"] * 100.0), 0.0)

        if row_dim == "bulan":
            divisor_s = grp.index.map(lambda ym: float(days_per_month.get(str(ym), active_days)))
            grp["daily_trx"] = grp["trx_count"] / divisor_s
            if is_financial:
                grp["daily_jual"] = grp["jual_sum"] / divisor_s
                grp["daily_margin"] = grp["margin_sum"] / divisor_s
        elif row_dim == "tanggal":
            grp["daily_trx"] = grp["trx_count"].astype(float)
            if is_financial:
                grp["daily_jual"] = grp["jual_sum"].astype(float)
                grp["daily_margin"] = grp["margin_sum"].astype(float)
        else:
            grp["daily_trx"] = grp["trx_count"] / float(active_days)
            if is_financial:
                grp["daily_jual"] = grp["jual_sum"] / float(active_days)
                grp["daily_margin"] = grp["margin_sum"] / float(active_days)

        if row_dim in ("bulan", "tanggal"):
            grp = grp.sort_index(ascending=True)
        else:
            sort_col = metric if metric in grp.columns else "trx_count"
            grp = grp.sort_values(by=sort_col, ascending=False).head(top_limit)

        rows_data = []
        if is_financial:
            for idx_val, r_s in grp.iterrows():
                rows_data.append({
                    "_row_label": str(idx_val),
                    "trx_count": int(r_s["trx_count"]),
                    "daily_trx": round(float(r_s["daily_trx"]), 1),
                    "qty_sum": round(float(r_s["qty_sum"]), 0),
                    "base_price_avg": round(float(r_s["base_price_avg"]), 0),
                    "net_arpu": round(float(r_s["net_arpu"]), 0),
                    "base_price_sum": round(float(r_s["base_price_sum"]), 0),
                    "margin_sum": round(float(r_s["margin_sum"]), 0),
                    "daily_margin": round(float(r_s["daily_margin"]), 0),
                    "margin_pct": round(float(r_s["margin_pct"]), 2),
                    "jual_sum": round(float(r_s["jual_sum"]), 0),
                    "daily_jual": round(float(r_s["daily_jual"]), 0),
                    "beli_sum": round(float(r_s["beli_sum"]), 0),
                    "sukses_pct": round(float(r_s["sukses_pct"]), 2)
                })

            total_dict = {
                "_row_label": "TOTAL",
                "trx_count": total_trx,
                "daily_trx": me.calculate_daily_rate(total_trx, active_days),
                "qty_sum": round(float(df["qty"].sum()), 0) if "qty" in df.columns else 0,
                "base_price_avg": round(total_base_price / total_trx, 0) if total_trx > 0 else 0.0,
                "net_arpu": overall_net_arpu,
                "base_price_sum": round(total_base_price, 0),
                "margin_sum": round(total_margin, 0),
                "daily_margin": round(me.calculate_daily_rate(total_margin, active_days), 0),
                "margin_pct": overall_margin_pct,
                "jual_sum": round(total_jual, 0),
                "daily_jual": round(me.calculate_daily_rate(total_jual, active_days), 0),
                "beli_sum": round(float(df["beli"].sum()), 0),
                "sukses_pct": overall_sukses_rate
            }

            return {
                "is_2d": False,
                "row_dim": row_dim,
                "columns": ["trx_count", "daily_trx", "base_price_avg", "net_arpu", "base_price_sum", "margin_sum", "daily_margin", "margin_pct", "jual_sum", "daily_jual", "beli_sum", "qty_sum", "sukses_pct"],
                "rows": rows_data,
                "total_row": total_dict,
                "summary": summary,
                "elapsed_ms": round((time.time() - t0) * 1000, 1)
            }
        else:
            for idx_val, r_s in grp.iterrows():
                rows_data.append({
                    "_row_label": str(idx_val),
                    "trx_count": int(r_s["trx_count"]),
                    "daily_trx": round(float(r_s["daily_trx"]), 1),
                    "sukses_pct": round(float(r_s["sukses_pct"]), 2)
                })

            total_dict = {
                "_row_label": "TOTAL",
                "trx_count": total_trx,
                "daily_trx": me.calculate_daily_rate(total_trx, active_days),
                "sukses_pct": overall_sukses_rate
            }

            return {
                "is_2d": False,
                "row_dim": row_dim,
                "columns": ["trx_count", "daily_trx", "sukses_pct"],
                "rows": rows_data,
                "total_row": total_dict,
                "summary": summary,
                "elapsed_ms": round((time.time() - t0) * 1000, 1)
            }
