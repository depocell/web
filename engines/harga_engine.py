"""
engines/harga_engine.py
Engine Pivot Tabel Riwayat Harga Jual 6 Bulan Terakhir dari Tiap Produk sesuai Kategorinya.
Mendukung:
1. PRODUK FISIK (Sumber: SISCOM Excel 0526.xls - 1026.xls di pages/fisik/)
2. ASTAGA (Sumber: OtomaX Parquet trx_astaga_2026.parquet + master_data.db)
3. OKIPAY (Sumber: OtomaX Parquet trx_okipay_2026.parquet + master_data.db)
"""

import os
import time
import glob
from typing import Dict, Any, List
import pandas as pd
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, ".cache")
MASTER_DIR = os.path.join(BASE_DIR, "MASTER")
FISIK_DIR = os.path.join(BASE_DIR, "pages", "fisik")
DB_PATH = os.path.join(MASTER_DIR, "master_data.db")

# In-memory RAM cache for instant response (<5ms)
_PRICE_CACHE: Dict[str, Dict[str, Any]] = {}
_PRICE_CACHE_TIME: Dict[str, float] = {}

MONTH_LABELS = {
    1: "Januari 2026", 2: "Februari 2026", 3: "Maret 2026", 4: "April 2026",
    5: "Mei 2026", 6: "Juni 2026", 7: "Juli 2026", 8: "Agustus 2026",
    9: "September 2026", 10: "Oktober 2026", 11: "November 2026", 12: "Desember 2026"
}


def clear_cache():
    """Reset in-memory cache."""
    _PRICE_CACHE.clear()
    _PRICE_CACHE_TIME.clear()


def get_fisik_price_pivot() -> Dict[str, Any]:
    """
    Ekstrak harga jual satuan produk fisik dari rekapan SISCOM untuk 6 periode terakhir.
    Harga Jual Satuan = Netto / Qty (atau Gross / Qty) per item per bulan.
    """
    cache_key = "FISIK"
    fisik_mtime = max([os.path.getmtime(f) for f in glob.glob(os.path.join(FISIK_DIR, "*.*"))] or [0])
    
    if cache_key in _PRICE_CACHE and _PRICE_CACHE_TIME.get(cache_key, 0) >= fisik_mtime:
        return _PRICE_CACHE[cache_key]

    from engines.fisik_engine import get_available_periods, _parse_excel

    all_periods = get_available_periods()
    # Ambil 6 periode terakhir (misal Mei - Okt 2026)
    periods_6 = all_periods[:6]
    # Urutkan kronologis dari terlama ke terbaru (Mei -> Juni -> ... -> Okt)
    periods_6 = list(reversed(periods_6))

    month_columns = [p["label"] for p in periods_6]
    
    products_dict: Dict[str, Dict[str, Any]] = {}

    for p in periods_6:
        m_label = p["label"]
        try:
            _, rows = _parse_excel(p["path"])
        except Exception:
            continue

        for r in rows:
            prod_name = str(r.get("produk", "")).strip()
            if not prod_name or "DEPOSIT" in prod_name.upper():
                continue

            qty = float(r.get("qty", 0.0) or 0.0)
            netto = float(r.get("netto", 0.0) or 0.0)

            if qty > 0 and netto > 0:
                unit_price = round(netto / qty)

                if prod_name not in products_dict:
                    products_dict[prod_name] = {
                        "kode": "-",
                        "nama": prod_name,
                        "kategori": r.get("tipe", "LAINNYA"),
                        "operator": r.get("operator", "LAINNYA"),
                        "monthly_prices": {},
                        "quantities": {}
                    }
                
                # Jika ada beberapa baris produk yang sama dalam 1 bulan, rata-rata tertimbang
                if m_label not in products_dict[prod_name]["monthly_prices"]:
                    products_dict[prod_name]["monthly_prices"][m_label] = unit_price
                    products_dict[prod_name]["quantities"][m_label] = qty
                else:
                    prev_p = products_dict[prod_name]["monthly_prices"][m_label]
                    prev_q = products_dict[prod_name]["quantities"][m_label]
                    total_q = prev_q + qty
                    if total_q > 0:
                        products_dict[prod_name]["monthly_prices"][m_label] = round((prev_p * prev_q + netto) / total_q)
                        products_dict[prod_name]["quantities"][m_label] = total_q

    rows_result = []
    categories_set = set()
    operators_set = set()

    for prod_name, pdata in products_dict.items():
        kategori = pdata["kategori"]
        operator = pdata["operator"]
        categories_set.add(kategori)
        operators_set.add(operator)

        prices = []
        valid_prices = []
        for m in month_columns:
            pr = pdata["monthly_prices"].get(m)
            prices.append(pr)
            if pr is not None:
                valid_prices.append(pr)

        first_price = valid_prices[0] if valid_prices else None
        last_price = valid_prices[-1] if valid_prices else None
        diff = (last_price - first_price) if (first_price is not None and last_price is not None) else 0

        if len(valid_prices) <= 1:
            status = "STABIL"
        elif diff > 0:
            status = f"NAIK +Rp {diff:,.0f}".replace(",", ".")
        elif diff < 0:
            status = f"TURUN -Rp {abs(diff):,.0f}".replace(",", ".")
        else:
            status = "STABIL"

        rows_result.append({
            "kode": pdata["kode"],
            "nama": pdata["nama"],
            "kategori": kategori,
            "operator": operator,
            "prices": prices,
            "first_price": first_price,
            "last_price": last_price,
            "diff": diff,
            "status": status
        })

    # Urutkan berdasarkan Kategori -> Operator -> Nama Produk
    rows_result.sort(key=lambda x: (x["kategori"], x["operator"], x["nama"]))

    res = {
        "ok": True,
        "source": "FISIK",
        "source_label": "Produk Fisik (SISCOM)",
        "months": month_columns,
        "categories": sorted(list(categories_set)),
        "operators": sorted(list(operators_set)),
        "total_products": len(rows_result),
        "data": rows_result
    }

    _PRICE_CACHE[cache_key] = res
    _PRICE_CACHE_TIME[cache_key] = fisik_mtime
    return res


def get_digital_price_pivot(brand: str = "ASTAGA") -> Dict[str, Any]:
    """
    Ekstrak harga jual server median/modus per produk digital dari Parquet transaksi OtomaX
    selama 6 bulan terakhir pada tahun 2026.
    """
    brand = brand.upper()
    cache_key = f"DIGITAL_{brand}"
    p_cache = os.path.join(CACHE_DIR, f"trx_{brand.lower()}_2026.parquet")
    mtime = os.path.getmtime(p_cache) if os.path.exists(p_cache) else 0

    if cache_key in _PRICE_CACHE and _PRICE_CACHE_TIME.get(cache_key, 0) >= mtime and mtime > 0:
        return _PRICE_CACHE[cache_key]

    if not os.path.exists(p_cache):
        return {"ok": False, "error": f"File transaksi {p_cache} tidak ditemukan."}

    # 1. Baca master produk untuk nama, kategori, dan operator
    prod_master: Dict[str, Dict[str, str]] = {}
    master_p = os.path.join(CACHE_DIR, f"prod_full_{brand.lower()}.parquet")
    if os.path.exists(master_p):
        try:
            df_m = pd.read_parquet(master_p)
            for _, r in df_m.iterrows():
                pid = str(r.get("product_id", "")).strip().upper()
                if pid:
                    prod_master[pid] = {
                        "nama": str(r.get("product_name", pid)).strip(),
                        "kategori": str(r.get("kategori", "LAINNYA")).strip().upper(),
                        "operator": str(r.get("operator", "LAINNYA")).strip().upper()
                    }
        except Exception:
            pass

    # 2. Baca data transaksi sukses 2026
    df = pd.read_parquet(p_cache, columns=["product_id", "tgl_entry", "jual", "status", "ar_id"])
    
    # Filter akun internal ASTAGA
    if brand == "ASTAGA":
        import engines.metrics_engine as me
        df = me.filter_astaga_internal(df)

    df = df[df["status"].astype(str).str.lower() == "sukses"]
    df["month"] = df["tgl_entry"].dt.month
    
    available_months = sorted(df["month"].unique().tolist())
    last_6_months = available_months[-6:] if len(available_months) >= 6 else available_months
    
    df_6 = df[df["month"].isin(last_6_months)]

    # Pivot median harga jual per produk per bulan
    pv = df_6.groupby(["product_id", "month"])["jual"].median().unstack()

    month_columns = [MONTH_LABELS.get(m, f"Bulan {m}") for m in last_6_months]

    rows_result = []
    categories_set = set()
    operators_set = set()

    for pid in pv.index:
        pid_clean = str(pid).strip().upper()
        meta = prod_master.get(pid_clean, {
            "nama": pid_clean,
            "kategori": "LAINNYA",
            "operator": "LAINNYA"
        })
        kategori = meta["kategori"] or "LAINNYA"
        operator = meta["operator"] or "LAINNYA"
        nama = meta["nama"] or pid_clean

        categories_set.add(kategori)
        operators_set.add(operator)

        prices = []
        valid_prices = []
        for m in last_6_months:
            val = pv.loc[pid, m] if m in pv.columns else np.nan
            if pd.notna(val) and val > 0:
                p_int = int(round(val))
                prices.append(p_int)
                valid_prices.append(p_int)
            else:
                prices.append(None)

        first_price = valid_prices[0] if valid_prices else None
        last_price = valid_prices[-1] if valid_prices else None
        diff = (last_price - first_price) if (first_price is not None and last_price is not None) else 0

        if len(valid_prices) <= 1:
            status = "STABIL"
        elif diff > 0:
            status = f"NAIK +Rp {diff:,.0f}".replace(",", ".")
        elif diff < 0:
            status = f"TURUN -Rp {abs(diff):,.0f}".replace(",", ".")
        else:
            status = "STABIL"

        rows_result.append({
            "kode": pid_clean,
            "nama": nama,
            "kategori": kategori,
            "operator": operator,
            "prices": prices,
            "first_price": first_price,
            "last_price": last_price,
            "diff": diff,
            "status": status
        })

    # Urutkan berdasarkan Kategori -> Operator -> Kode Produk
    rows_result.sort(key=lambda x: (x["kategori"], x["operator"], x["kode"]))

    res = {
        "ok": True,
        "source": brand,
        "source_label": f"Digital ({brand})",
        "months": month_columns,
        "categories": sorted(list(categories_set)),
        "operators": sorted(list(operators_set)),
        "total_products": len(rows_result),
        "data": rows_result
    }

    _PRICE_CACHE[cache_key] = res
    _PRICE_CACHE_TIME[cache_key] = mtime
    return res


def get_price_pivot(source: str = "FISIK") -> Dict[str, Any]:
    """
    Fungsi utama untuk mengambil pivot harga 6 bulan terakhir.
    source: 'FISIK', 'ASTAGA', atau 'OKIPAY'
    """
    source = str(source).upper().strip()
    if source == "FISIK":
        return get_fisik_price_pivot()
    elif source in ["ASTAGA", "OKIPAY"]:
        return get_digital_price_pivot(source)
    else:
        return get_fisik_price_pivot()
